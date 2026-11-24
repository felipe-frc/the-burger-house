"""Run explicitly against the synthetic local portfolio. Each case rolls back."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import psycopg

spec = importlib.util.spec_from_file_location(
    "demo_seed", Path(__file__).resolve().parents[1] / "scripts/admin/seed-demo-catalog.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DemoCatalogTests(unittest.TestCase):
    def setUp(self):
        if os.environ.get("PGHOST") != "127.0.0.1" or os.environ.get("PGDATABASE") != "tbh_portfolio_dev":
            raise RuntimeError("Explicit local portfolio libpq environment required.")
        self.db = psycopg.connect("")

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def products(self):
        return self.db.execute('SELECT row_to_json(p)::text FROM "Products" p ORDER BY "Id"').fetchall()

    def test_repeated_seed_preserves_ids_history_and_commercial_count(self):
        before = module.history_fingerprints(self.db)
        first = module.seed(self.db)
        ids = self.db.execute('SELECT "Id","Code" FROM "Products" ORDER BY "Id"').fetchall()
        second = module.seed(self.db)
        self.assertEqual(0, second["created"])
        self.assertEqual(ids, self.db.execute('SELECT "Id","Code" FROM "Products" ORDER BY "Id"').fetchall())
        self.assertEqual(before, module.history_fingerprints(self.db))
        self.assertEqual(15, first["commercialProducts"])
        self.assertEqual(15, self.db.execute('SELECT count(*) FROM "Products" WHERE "IsActive"').fetchone()[0])

    def test_legacy_records_are_only_deactivated(self):
        legacy = self.db.execute('SELECT "Id","Code","Name","Price","Description" FROM "Products" WHERE "Code" NOT LIKE %s ORDER BY "Id"', ("demo-%",)).fetchall()
        module.seed(self.db)
        self.assertEqual(legacy, self.db.execute('SELECT "Id","Code","Name","Price","Description" FROM "Products" WHERE "Code" NOT LIKE %s ORDER BY "Id"', ("demo-%",)).fetchall())
        self.assertEqual(0, self.db.execute('SELECT count(*) FROM "Products" WHERE "IsActive" AND "Code" NOT LIKE %s', ("demo-%",)).fetchone()[0])

    def test_constraint_failure_rolls_back_partial_changes(self):
        before = self.products()
        data = json.loads(module.MANIFEST.read_text(encoding="utf8"))
        data["products"][0]["price"] = 1
        data["products"][-1]["description"] = "x" * 501
        with tempfile.TemporaryDirectory(prefix="tbh-demo-catalog-") as directory:
            manifest = Path(directory) / "catalog.json"
            manifest.write_text(json.dumps(data), encoding="utf8")
            with self.assertRaises(psycopg.Error):
                with self.db.transaction():
                    with patch.object(module, "MANIFEST", manifest):
                        module.seed(self.db)
        self.assertEqual(before, self.products())

    def test_foreign_destination_rejected(self):
        foreign = SimpleNamespace(info=SimpleNamespace(host="remote.example.invalid"))
        with self.assertRaises(ValueError):
            module.seed(foreign)


if __name__ == "__main__":
    unittest.main()
