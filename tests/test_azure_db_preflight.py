import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import closing

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("azure_db_preflight", ROOT / "scripts/admin/azure-db-preflight.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DatabasePreflightTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=ROOT / ".test-tmp")
        self.root = pathlib.Path(self.temporary.name).resolve()
        assert self.root.is_relative_to(ROOT / ".test-tmp")
        self.addCleanup(self.temporary.cleanup)

    def test_consistent_backup_includes_committed_wal_and_preserves_existing_data(self):
        database = self.root / "burgerhouse.db"
        with closing(sqlite3.connect(database)) as source:
            source.execute("PRAGMA journal_mode=WAL")
            source.execute("CREATE TABLE AdminUsers(Id INTEGER PRIMARY KEY, PasswordHash TEXT)")
            source.execute("CREATE TABLE Products(Id INTEGER PRIMARY KEY, Name TEXT)")
            source.execute("CREATE TABLE AdminAuditLogs(Id INTEGER PRIMARY KEY, Action TEXT)")
            source.execute("INSERT INTO AdminUsers VALUES(1, 'local-fixture-hash')")
            source.execute("INSERT INTO Products VALUES(1, 'Historic product')")
            source.execute("INSERT INTO AdminAuditLogs VALUES(1, 'Historic event')")
            source.commit()
            source.execute("INSERT INTO Products VALUES(2, 'Committed WAL product')")
            source.commit()
            report = MODULE.snapshot_database(database, self.root / "backups")
            self.assertEqual(report["backupIntegrity"], ["ok"])
            self.assertEqual(report["tableCounts"], {"Products": 2, "AdminUsers": 1, "AdminAuditLogs": 1})
            self.assertFalse(report["passwordResetExecuted"])
            with closing(sqlite3.connect(report["backup"])) as backup:
                self.assertEqual(backup.execute("SELECT Name FROM Products ORDER BY Id").fetchall(), source.execute("SELECT Name FROM Products ORDER BY Id").fetchall())
            self.assertEqual(source.execute("SELECT PasswordHash FROM AdminUsers").fetchone()[0], "local-fixture-hash")
            self.assertEqual(source.execute("SELECT COUNT(*) FROM AdminAuditLogs").fetchone()[0], 1)

    def test_missing_database_is_never_created(self):
        missing = self.root / "missing.db"
        with self.assertRaises(FileNotFoundError):
            MODULE.snapshot_database(missing, self.root / "backups")
        self.assertFalse(missing.exists())

    def test_missing_owner_is_rejected_without_creating_an_owner(self):
        database = self.root / "empty-owner.db"
        with closing(sqlite3.connect(database)) as source:
            source.execute("CREATE TABLE AdminUsers(Id INTEGER PRIMARY KEY)")
        with self.assertRaisesRegex(RuntimeError, "exactly one existing Owner"):
            MODULE.snapshot_database(database, self.root / "backups")
        with closing(sqlite3.connect(database)) as source:
            self.assertEqual(source.execute("SELECT COUNT(*) FROM AdminUsers").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
