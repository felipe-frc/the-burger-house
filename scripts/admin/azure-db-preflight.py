"""Run inside the authorized App Service SSH; never changes source DB records."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import sqlite3
from contextlib import closing


def snapshot_database(database, backup_directory):
    source_path = pathlib.Path(database).resolve(strict=True)
    if not source_path.is_file():
        raise RuntimeError("The existing production database was not found.")
    backup_directory = pathlib.Path(backup_directory)
    backup_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_directory / ("owner-recovery-" + stamp + ".db")
    descriptor = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    with closing(sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)) as source:
        with closing(sqlite3.connect(str(backup))) as target:
            source.backup(target)
            integrity = [row[0] for row in target.execute("PRAGMA integrity_check")]
            if integrity != ["ok"]:
                raise RuntimeError("Backup integrity verification failed; do not reset.")
            tables = {row[0] for row in target.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            expected = ["Products", "Orders", "OrderItems", "Payments", "PaymentRefunds", "AdminUsers", "AdminSessions", "AdminAuditLogs"]
            counts = {name: target.execute('SELECT COUNT(*) FROM "' + name + '"').fetchone()[0] for name in expected if name in tables}
            migrations = [row[0] for row in target.execute('SELECT MigrationId FROM "__EFMigrationsHistory" ORDER BY MigrationId')] if "__EFMigrationsHistory" in tables else []
            owners = counts.get("AdminUsers")
            if owners != 1:
                raise RuntimeError("Expected exactly one existing Owner; do not create another account or reset.")
    with backup.open("rb") as data:
        digest = hashlib.file_digest(data, "sha256").hexdigest()
    return {"source": str(source_path), "backup": str(backup), "backupIntegrity": integrity,
            "backupSha256": digest, "tableCounts": counts, "migrationIds": migrations,
            "businessDataModified": False, "passwordResetExecuted": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="/home/burgerhouse.db")
    parser.add_argument("--backup-directory", default="/home/backups/owner-recovery")
    arguments = parser.parse_args()
    print(json.dumps(snapshot_database(arguments.database, arguments.backup_directory), indent=2))
