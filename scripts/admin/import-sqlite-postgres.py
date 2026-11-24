"""Transactional transfer into an empty PostgresContext baseline. Requires psycopg 3."""
import argparse
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal
from graphlib import TopologicalSorter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
from uuid import UUID

import psycopg
from psycopg import sql


class Refused(Exception):
    """Only raise with a diagnostic safe for the operator's terminal."""


def require(condition, message):
    if not condition:
        raise Refused(message)


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def convert(value, kind, scale, options, adjustments):
    if value is None:
        return None
    if kind == "boolean":
        require(type(value) is int and value in (0, 1), "Invalid legacy boolean")
        return bool(value)
    if kind == "numeric":
        require(type(value) in (int, str), "Inexact monetary storage")
        result = Decimal(value)
        require(result.is_finite() and result == result.quantize(Decimal(1).scaleb(-scale)), "Inexact scale")
        return result
    if kind == "uuid":
        return UUID(value)
    if kind == "date":
        return date.fromisoformat(value)
    if kind == "timestamp with time zone":
        fraction = re.search(r"\.(\d+)", value)
        if fraction and fraction[1][6:].strip("0"):
            require(options.truncate_ticks, "Sub-microsecond timestamp requires an explicit decision")
            adjustments["truncated_submicroseconds"] += 1
        result = datetime.fromisoformat(value)
        if result.tzinfo is None:
            require(options.sqlite_utc, "Naive legacy timestamp requires confirmation of UTC semantics")
            result = result.replace(tzinfo=timezone.utc)
            adjustments["naive_utc"] += 1
        return result.astimezone(timezone.utc)
    if kind in ("integer", "bigint"):
        require(type(value) is int, "Invalid integer storage")
    elif kind == "double precision":
        require(type(value) in (float, int) and math.isfinite(value), "Invalid floating point value")
        return float(value)
    elif kind in ("text", "character varying"):
        require(isinstance(value, str), "Invalid text storage")
    else:
        raise Refused("Unsupported PostgreSQL type")
    return value


def fingerprint(row):
    values = [str(v.normalize()) if isinstance(v, Decimal) else v for v in row]
    raw = json.dumps(values, default=str, separators=(",", ":"), ensure_ascii=False).encode()
    return int.from_bytes(hashlib.sha256(raw).digest(), "big")


def transfer(source, pg, options):
    source.execute("pragma query_only=on")
    source.execute("begin")
    require(source.execute("pragma integrity_check").fetchall() == [("ok",)], "SQLite integrity check failed")
    require(source.execute("pragma foreign_key_check").fetchone() is None, "SQLite foreign key violation")
    migration_dir = Path(__file__).resolve().parents[2] / "backend/BurgerHouse.Infrastructure/Persistence/Migrations"
    known = sorted(p.stem for p in migration_dir.glob("[0-9]*.cs") if not p.name.endswith(".Designer.cs"))
    history = [r[0] for r in source.execute('select MigrationId from __EFMigrationsHistory order by MigrationId')]
    require(24 <= len(history) <= len(known) and history == known[:len(history)], "Unexpected SQLite history")
    require(pg.info.dbname == options.database, "Wrong PostgreSQL database")
    pg.execute("set local time zone 'UTC'")
    pg.execute("set local lock_timeout='5s'")
    schema = pg.execute("select current_schema()").fetchone()[0]
    require(schema == options.schema, "Wrong PostgreSQL schema")
    table_id = lambda name: sql.Identifier(schema, name)
    postgres_dir = migration_dir.parent / "PostgresMigrations"
    expected = sorted(p.stem for p in postgres_dir.glob("[0-9]*.cs") if not p.name.endswith(".Designer.cs"))
    require(pg.execute(sql.SQL('select "MigrationId" from {} order by 1').format(table_id("__EFMigrationsHistory"))).fetchall()
            == [(name,) for name in expected], "Unexpected target migration history")
    columns = {}
    for table, col, kind, scale in pg.execute("""
        select table_name,column_name,data_type,numeric_scale from information_schema.columns
        where table_schema=current_schema() and table_name <> '__EFMigrationsHistory'
        order by table_name,ordinal_position"""):
        columns.setdefault(table, []).append((col, kind, scale))
    source_tables = {r[0] for r in source.execute("select name from sqlite_schema where type='table'")}
    source_tables -= {"sqlite_sequence", "__EFMigrationsHistory", "__EFMigrationsLock"}
    missing = set()
    if len(history) < 25:
        missing.update(("TeamJournalEntries", "TeamWorkDays"))
    if len(history) < 26:
        missing.add("DeliveryTracking")
    if len(history) < 28:
        missing.update(("AddonOptions", "Coupons"))
    require(source_tables == columns.keys() - missing, "Incompatible table sets")
    source_indexes = {row[0] for row in source.execute(
        "select name from sqlite_schema where type='index' and sql is not null")}
    target_indexes = {row[0] for row in pg.execute("""
        select c.relname from pg_index i join pg_class c on c.oid=i.indexrelid
        where c.relnamespace=current_schema()::regnamespace and i.indisvalid and i.indisready""")}
    require(source_indexes <= target_indexes, "A legacy index has no valid target index")
    require(pg.execute("show session_replication_role").fetchone()[0] == "origin", "Foreign key checks disabled")
    deps = {table: set() for table in columns}
    for child, parent in pg.execute("""
        select c.relname,p.relname from pg_constraint f join pg_class c on c.oid=f.conrelid
        join pg_class p on p.oid=f.confrelid where f.contype='f'
        and c.relnamespace=current_schema()::regnamespace"""):
        if child != parent:
            deps[child].add(parent)
    order = list(TopologicalSorter(deps).static_order())
    pg.execute(sql.SQL("lock table {} in access exclusive mode").format(
        sql.SQL(",").join(table_id(t) for t in sorted(columns))))
    for t in order:
        require(not pg.execute(sql.SQL("select exists(select from {} limit 1)").format(table_id(t))).fetchone()[0],
                "Target contains records; entire transfer refused")
    counts, sums, adjustments = {}, {}, Counter()
    sequences = dict(source.execute("select name,seq from sqlite_sequence"))
    for t in order:
        attrs = columns[t]
        names = [a[0] for a in attrs]
        count = digest = 0
        if t not in missing:
            legacy = {r[1] for r in source.execute("pragma table_info(" + identifier(t) + ")")}
            absent = {"SaleCategory"} if t == "OrderItems" and len(history) < 27 else set()
            defaults = {}
            if len(history) < 28:
                if t == "Orders":
                    defaults = {"Discount": "0", "CouponCode": "NULL"}
                if t == "OrderItems":
                    defaults = {"DiscountAmount": "0", "ExtrasJson": "NULL"}
                absent.update(defaults)
            require(legacy == set(names) - absent, "Incompatible columns in " + t)
            fields = ",".join(identifier(n) if n in legacy else defaults.get(n, "NULL") for n in names)
            cmd = sql.SQL("copy {} ({}) from stdin").format(table_id(t), sql.SQL(",").join(map(sql.Identifier, names)))
            with pg.cursor().copy(cmd) as copy:
                for row in source.execute("select " + fields + " from " + identifier(t)):
                    try:
                        typed = tuple(convert(v, kind, scale, options, adjustments)
                                      for v, (_, kind, scale) in zip(row, attrs))
                        digest += fingerprint(typed)
                        copy.write_row(typed)
                    except Exception as err:
                        reason = str(err) if isinstance(err, Refused) else type(err).__name__
                        raise Refused(f"{t} row {count + 1}: {reason}") from None
                    count += 1
                    for v, (n, kind, _) in zip(typed, attrs):
                        if kind == "numeric" and v is not None:
                            key = (t, n)
                            sums[key] = sums.get(key, Decimal(0)) + v
        with pg.cursor(name="verify_transfer") as reader:
            reader.execute(sql.SQL("select {} from {}").format(sql.SQL(",").join(map(sql.Identifier, names)), table_id(t)))
            actual_count = actual_digest = 0
            for row in reader:
                actual_count += 1
                actual_digest += fingerprint(row)
        require((actual_count, actual_digest) == (count, digest), "Row reconciliation failed in " + t)
        counts[t] = count
        for n in names:
            sequence = pg.execute("select pg_get_serial_sequence(%s,%s)", (identifier(schema)+"."+identifier(t), n)).fetchone()[0]
            if sequence:
                seq_schema, seq_name = pg.execute("""
                    select ns.nspname,c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
                    where c.oid=%s::regclass""", (sequence,)).fetchone()
                maximum = pg.execute(sql.SQL("select max({}) from {}").format(sql.Identifier(n), table_id(t))).fetchone()[0]
                next_id = max(maximum or 0, sequences.get(t, 0), 0) + 1
                pg.execute(sql.SQL("alter sequence {} restart with {}").format(sql.Identifier(seq_schema, seq_name), sql.Literal(next_id)))
    for (t, n), expected in sums.items():
        actual = pg.execute(sql.SQL("select sum({}) from {}").format(sql.Identifier(n), table_id(t))).fetchone()[0]
        require(actual == expected, "Numeric reconciliation failed in " + t + "." + n)
    payments = {}
    for status, method, amount, refunded in source.execute(
            'select "Status","Method","Amount","RefundedAmount" from "Payments"'):
        count, gross, refunds = payments.get((status, method), (0, Decimal(0), Decimal(0)))
        payments[status, method] = count + 1, gross + Decimal(amount), refunds + Decimal(refunded)
    for status, method, count, gross, refunds in pg.execute(sql.SQL("""
        select "Status","Method",count(*),sum("Amount"),sum("RefundedAmount")
        from {} group by "Status","Method"
        """).format(table_id("Payments"))):
        require(payments.pop((status, method), None) == (count, gross, refunds),
                "Payment totals differ by status or method")
    require(not payments, "Payment status or method missing on target")
    return {"verified_source_and_target_counts": counts, "numeric_sums_verified": len(sums),
            "payment_groups_reconciled": True, "explicit_date_conversions": dict(adjustments),
            "source_migrations": len(history)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--database", required=True)
    parser.add_argument("--schema", default="public")
    parser.add_argument("--sqlite-utc", action="store_true")
    parser.add_argument("--truncate-ticks", action="store_true")
    options = parser.parse_args()
    # libpq authentication stays in environment/service configuration. Remote TCP requires verified TLS.
    loopback = ("127.0.0.1", "::1")
    local = os.environ.get("PGHOST") in loopback and os.environ.get("PGHOSTADDR") in (*loopback, None)
    with sqlite3.connect(options.source.resolve(strict=True).as_uri() + "?mode=ro", uri=True) as source:
        with psycopg.connect(sslmode=os.environ.get("PGSSLMODE", "prefer") if local else "verify-full") as pg:
            result = transfer(source, pg, options)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Driver diagnostics may contain full rows, addresses or credentials.
        print(str(error) if isinstance(error, Refused) else
              f"Transfer failed ({type(error).__name__}, SQLSTATE {getattr(error, 'sqlstate', None)})", file=sys.stderr)
        sys.exit(1)
