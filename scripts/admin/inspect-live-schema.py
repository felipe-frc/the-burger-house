"""Read a configured SQLite file in place. Output only schema and aggregate checks."""
import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path


def inspect(path):
    uri = path.resolve(strict=True).as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True, timeout=3)) as db:
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        tables = sorted(row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))
        migrations = [row[0] for row in db.execute(
            'SELECT MigrationId FROM "__EFMigrationsHistory" ORDER BY MigrationId'
        )] if "__EFMigrationsHistory" in tables else None
        duplicates = None
        if "Payments" in tables:
            columns = {row[1] for row in db.execute("PRAGMA table_info(Payments)")}
            if "ExternalPaymentId" in columns:
                duplicates = db.execute(
                    "SELECT COUNT(*) FROM (SELECT ExternalPaymentId FROM Payments "
                    "WHERE ExternalPaymentId IS NOT NULL GROUP BY ExternalPaymentId HAVING COUNT(*) > 1)"
                ).fetchone()[0]
        return {"sqlite": sqlite3.sqlite_version, "tables": tables, "migrations": migrations,
                "integrityOk": db.execute("PRAGMA quick_check").fetchall() == [("ok",)],
                "foreignKeyViolations": sum(1 for _ in db.execute("PRAGMA foreign_key_check")),
                "duplicateProviderChargeGroups": duplicates}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    print(json.dumps(inspect(parser.parse_args().database)))
