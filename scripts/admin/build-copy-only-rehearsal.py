"""Build a standalone SSH runner containing no production connection or apply mode."""
import hashlib
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
executor = root / 'scripts/admin/production-catalog-cleanup.py'
source = executor.read_text(encoding='utf8')
functions = source.split('\ndef main():', 1)[0]
reviewed_sha = hashlib.sha256(executor.read_bytes()).hexdigest()
runner = functions + '\nimport sys\nREVIEWED_EXECUTOR_SHA=' + repr(reviewed_sha) + '\n' + r'''

def copy_database(source_connection, label):
    destination = BACKUP.parent / (label + '-' + uuid.uuid4().hex + '.db')
    if destination.resolve() == BACKUP.resolve(): raise RuntimeError('Refusing to overwrite reviewed backup.')
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600); os.close(fd)
    target = sqlite3.connect(destination)
    try: source_connection.backup(target)
    finally: target.close()
    return destination

def readonly(filename):
    c = sqlite3.connect(pathlib.Path(filename).as_uri() + '?mode=ro', uri=True)
    c.row_factory = sqlite3.Row; c.execute('PRAGMA foreign_keys=ON')
    return c

def monetary_errors(c):
    errors = []
    for p in rows(c, 'SELECT Id,OrderId,Amount FROM Payments'):
        order = c.execute('SELECT DeliveryFee FROM Orders WHERE Id=?', (p['OrderId'],)).fetchone()
        items = rows(c, 'SELECT Quantity,UnitPrice FROM OrderItems WHERE OrderId=?', (p['OrderId'],))
        if order is None or sum((Decimal(str(i['UnitPrice'])) * i['Quantity'] for i in items), Decimal(0)) + Decimal(str(order[0])) != Decimal(str(p['Amount'])):
            errors.append(p['Id'])
    return errors

def metrics(c, original_audit_ids):
    keep = rows(c, 'SELECT * FROM Products WHERE Id NOT IN (' + marks(LEGACY) + ') ORDER BY Id', tuple(LEGACY))
    remaining = {
        'Orders': rows(c, 'SELECT * FROM Orders WHERE Id NOT IN (' + marks(ORDERS) + ') ORDER BY Id', ORDERS),
        'OrderItems': rows(c, 'SELECT * FROM OrderItems WHERE OrderId NOT IN (' + marks(ORDERS) + ') ORDER BY Id', ORDERS),
        'Payments': rows(c, 'SELECT * FROM Payments WHERE OrderId NOT IN (' + marks(ORDERS) + ') ORDER BY Id', ORDERS),
        'PaymentRefunds': rows(c, 'SELECT * FROM PaymentRefunds ORDER BY Id')}
    original_audits = rows(c, 'SELECT * FROM AdminAuditLogs WHERE Id IN (' + marks(original_audit_ids) + ') ORDER BY Id', original_audit_ids)
    return {
        'counts': {t:c.execute('SELECT COUNT(*) FROM ' + t).fetchone()[0] for t in [*COUNTS, 'AdminUser', 'AdminSession', '__EFMigrationsHistory']},
        'integrity':[r[0] for r in c.execute('PRAGMA integrity_check')],
        'foreignKeyFailures':[list(r) for r in c.execute('PRAGMA foreign_key_check')],
        'monetaryMismatchPaymentIds':monetary_errors(c),
        'allProductsSha256':digest(rows(c, 'SELECT * FROM Products ORDER BY Id')),
        'keptProductsSha256':digest(keep), 'allFinancialRowsSha256':finance(c),
        'remainingFinancialRowsSha256':digest(remaining),
        'originalAuditRowsSha256':digest(original_audits),
        'migrationsSha256':digest(rows(c, 'SELECT * FROM __EFMigrationsHistory ORDER BY MigrationId'))}

def copy_only_main():
    if len(sys.argv) > 1: raise RuntimeError('Copy-only runner accepts no apply/rollback flags.')
    if not BACKUP.is_file() or hashlib.sha256(BACKUP.read_bytes()).hexdigest() != BACKUP_SHA:
        raise RuntimeError('Reviewed backup not verified.')
    original = readonly(BACKUP)
    try:
        audit_ids = [r[0] for r in original.execute('SELECT Id FROM AdminAuditLogs ORDER BY Id')]
        original_identity = {t:rows(original, 'SELECT * FROM ' + t + ' ORDER BY Id') for t in ['AdminUser','AdminSession']}
        before = metrics(original, audit_ids)
        if before['allFinancialRowsSha256'] != FINANCE_SHA or before['keptProductsSha256'] != KEEP_SHA:
            raise RuntimeError('Reviewed fingerprints differ.')
        deletion_path = copy_database(original, 'rehearsal-delete-copy')
    finally: original.close()
    deletion = sqlite3.connect(deletion_path); deletion.row_factory = sqlite3.Row
    try:
        execute_transaction(deletion, {'mode':'REHEARSAL-COPY-ONLY','reviewedBackupSha256':BACKUP_SHA})
        after = metrics(deletion, audit_ids)
        after_identity = {t:rows(deletion, 'SELECT * FROM ' + t + ' ORDER BY Id') for t in ['AdminUser','AdminSession']}
        reversal_path = copy_database(deletion, 'rehearsal-reversal-copy')
    finally: deletion.close()
    reversal = sqlite3.connect(reversal_path); reversal.row_factory = sqlite3.Row
    try:
        reversal_result = rollback_reviewed_deletion(reversal, BACKUP, 'COPY-ONLY-REVERSAL-TEST-NOT-PRODUCTION-APPROVAL')
        restored = metrics(reversal, audit_ids)
        restored_identity = {t:rows(reversal, 'SELECT * FROM ' + t + ' ORDER BY Id') for t in ['AdminUser','AdminSession']}
    finally: reversal.close()
    checks = {
        'deletionCountsMatch':all(after['counts'][t] == n for t,n in {'Products':15,'Orders':26,'OrderItems':33,'Payments':26,'PaymentRefunds':0,'AdminAuditLogs':23}.items()),
        'retainedProductFingerprintUnchanged':before['keptProductsSha256'] == after['keptProductsSha256'] == restored['keptProductsSha256'],
        'retainedFinanceFingerprintUnchanged':before['remainingFinancialRowsSha256'] == after['remainingFinancialRowsSha256'] == restored['remainingFinancialRowsSha256'],
        'existingAuditFingerprintUnchanged':before['originalAuditRowsSha256'] == after['originalAuditRowsSha256'] == restored['originalAuditRowsSha256'],
        'migrationsUnchanged':before['migrationsSha256'] == after['migrationsSha256'] == restored['migrationsSha256'],
        'ownerAndSessionsUnchanged':original_identity == after_identity == restored_identity,
        'reversalRestoresWholeCatalog':before['allProductsSha256'] == restored['allProductsSha256'],
        'reversalRestoresWholeFinance':before['allFinancialRowsSha256'] == restored['allFinancialRowsSha256'],
        'reversalCountsMatch':all(restored['counts'][t] == n for t,n in {**COUNTS,'AdminAuditLogs':24}.items()),
        'allIntegrityChecksOk':all(m['integrity'] == ['ok'] and not m['foreignKeyFailures'] and not m['monetaryMismatchPaymentIds'] for m in [before,after,restored]),
        'reviewedBackupBytesUnchanged':hashlib.sha256(BACKUP.read_bytes()).hexdigest() == BACKUP_SHA}
    if not all(checks.values()): raise RuntimeError('Rehearsal check failed: ' + ','.join(k for k,v in checks.items() if not v))
    result = {'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'REHEARSAL-COPY-ONLY',
        'productionDatabaseOpened':False,'productionModified':False,'productionDeletionAuthorized':False,
        'reviewedBackup':str(BACKUP),'reviewedBackupSha256':BACKUP_SHA,'reviewedExecutorSha256':REVIEWED_EXECUTOR_SHA,
        'deletionCopy':str(deletion_path),'reversalCopy':str(reversal_path),
        'before':before,'afterDeletion':after,'afterReversal':restored,'reversalResult':reversal_result,'checks':checks,'status':'passed'}
    receipt = BACKUP.parent / ('copy-only-rehearsal-result-' + uuid.uuid4().hex + '.json')
    fd = os.open(receipt, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd,'w') as output: json.dump(result,output)
    result['receipt']=str(receipt)
    print(json.dumps(result))

if __name__ == '__main__': copy_only_main()
'''
assert '/home/burgerhouse.db' not in runner
assert '--execute-approved' not in runner
output = root / 'test-results/catalog-final/production-copy-only-rehearsal.py'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(runner, encoding='utf8')
print(str(output))
print('sha256=' + hashlib.sha256(output.read_bytes()).hexdigest())
