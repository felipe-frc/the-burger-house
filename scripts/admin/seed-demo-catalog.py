"""Explicit, transactional catalog seed for the loopback PostgreSQL portfolio."""
import argparse
import hashlib
import json
import os
from decimal import Decimal
from pathlib import Path

import psycopg
from psycopg import sql

MANIFEST = Path(__file__).with_name("demo-catalog.json")


def history_fingerprints(connection):
    result = {}
    for table in ("Orders", "OrderItems", "Payments", "PaymentRefunds"):
        rows = connection.execute(sql.SQL(
            'SELECT row_to_json(t)::text FROM {} t ORDER BY "Id"'
        ).format(sql.Identifier(table))).fetchall()
        result[table] = hashlib.sha256("\n".join(row[0] for row in rows).encode()).hexdigest()
    return result


def seed(connection):
    if connection.info.host != "127.0.0.1" or connection.info.dbname != "tbh_portfolio_dev":
        raise ValueError("Only the local portfolio database is accepted.")
    schema = connection.execute("SELECT current_schema()").fetchone()[0]
    if schema != "public":
        raise ValueError("Only the public portfolio schema is accepted.")
    data = json.loads(MANIFEST.read_text(encoding="utf8"), parse_float=Decimal)
    products = data["products"]
    codes = [p["code"] for p in products]
    if data.get("synthetic") is not True or len(set(codes)) != 15:
        raise ValueError("Expected the explicit fifteen-product demonstration catalog.")
    if any(not p["code"].startswith("demo-") or not p["description"] or
           p["category"] not in ("menu", "sides", "drinks") or p["price"] <= 0
           for p in products):
        raise ValueError("Invalid demonstration product.")
    connection.execute('LOCK TABLE "Products" IN SHARE ROW EXCLUSIVE MODE')
    before = history_fingerprints(connection)
    # Preserve historical names, codes, prices, images and all foreign keys.
    hidden = connection.execute(
        'UPDATE "Products" SET "IsActive" = false WHERE "IsActive" AND NOT ("Code" = ANY(%s)) RETURNING "Code"',
        (codes,)).fetchall()
    created = 0
    for product in products:
        exists = connection.execute('SELECT 1 FROM "Products" WHERE "Code" = %s',
                                    (product["code"],)).fetchone()
        created += int(exists is None)
        connection.execute(
            '''INSERT INTO "Products"
               ("Code","Name","Description","EnglishName","EnglishDescription","Price","Category","DisplayOrder","IsActive")
               VALUES (%(code)s,%(name)s,%(description)s,%(englishName)s,%(englishDescription)s,%(price)s,%(category)s,%(displayOrder)s,true)
               ON CONFLICT ("Code") DO UPDATE SET
               "Name"=EXCLUDED."Name", "Description"=EXCLUDED."Description",
               "EnglishName"=EXCLUDED."EnglishName", "EnglishDescription"=EXCLUDED."EnglishDescription",
               "Price"=EXCLUDED."Price", "Category"=EXCLUDED."Category",
               "DisplayOrder"=EXCLUDED."DisplayOrder", "IsActive"=true''', product)
    for extra in data.get("extras", []):
        connection.execute(
            '''INSERT INTO "AddonOptions" ("Code","Name","Price","ProductCategory","MaximumQuantity","IsActive")
               VALUES (%(code)s,%(name)s,%(price)s,'menu',3,true)
               ON CONFLICT ("Code") DO UPDATE SET "Name"=EXCLUDED."Name", "Price"=EXCLUDED."Price",
               "IsActive"=true''', extra)
    connection.execute(
        '''INSERT INTO "Coupons" ("Code","IsActive","StartsAt","ExpiresAt","Percentage","FixedAmount",
           "MinimumSubtotal","ProductCategory","UsageLimit","UsedCount")
           VALUES ('BURGERTESTE10',true,now(),now()+interval '30 days',10,0,30,NULL,100,0)
           ON CONFLICT ("Code") DO NOTHING''')
    if history_fingerprints(connection) != before:
        raise RuntimeError("Historical financial data changed. Transaction aborted.")
    return {"synthetic": True, "created": created, "commercialProducts": len(products),
            "deactivatedCodes": [row[0] for row in hidden], "historyUnchanged": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True)
    parser.parse_args()
    if os.environ.get("PGHOST") != "127.0.0.1" or os.environ.get("PGDATABASE") != "tbh_portfolio_dev":
        raise ValueError("Set private libpq credentials for the local portfolio database.")
    if any(os.environ.get(key) for key in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE")):
        raise ValueError("Unexpected libpq connection override.")
    with psycopg.connect(host="127.0.0.1", hostaddr="127.0.0.1", dbname="tbh_portfolio_dev") as connection:
        report = seed(connection)
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"Catalog seed stopped ({type(error).__name__}). No partial transaction committed.") from None
