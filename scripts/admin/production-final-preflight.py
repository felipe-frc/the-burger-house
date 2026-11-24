"""Read-only production preflight. No apply, rollback, schema changes or DML."""
import datetime, hashlib, importlib.util, json, pathlib, sqlite3, sys
from decimal import Decimal

EXECUTOR_SHA='4496a9aa99d0879081c8be21af0b0fb70b7419aed2ed4a32ace4de4958c25c47'
EXECUTOR=pathlib.Path('/home/backups/catalog-cleanup/production-catalog-executor-'+EXECUTOR_SHA[:16]+'.py')
PRODUCTION=pathlib.Path('/home/burgerhouse.db')
REQUIRED_CHECKS=['deletionCountsMatch','retainedProductFingerprintUnchanged','retainedFinanceFingerprintUnchanged','existingAuditFingerprintUnchanged','migrationsUnchanged','ownerAndSessionsUnchanged','reversalRestoresWholeCatalog','reversalRestoresWholeFinance','reversalCountsMatch','allIntegrityChecksOk','reviewedBackupBytesUnchanged']

def readonly(filename):
    c=sqlite3.connect(pathlib.Path(filename).resolve(strict=True).as_uri()+'?mode=ro',uri=True)
    c.row_factory=sqlite3.Row;c.execute('PRAGMA query_only=ON');c.execute('PRAGMA foreign_keys=ON');c.execute('BEGIN')
    return c

def table_rows(c,name,key='Id'):
    return [dict(r) for r in c.execute('SELECT * FROM "'+name+'" ORDER BY "'+key+'"')]

def monetary_errors(c):
    errors=[]
    for p in table_rows(c,'Payments'):
        o=c.execute('SELECT DeliveryFee FROM Orders WHERE Id=?',(p['OrderId'],)).fetchone()
        items=c.execute('SELECT Quantity,UnitPrice FROM OrderItems WHERE OrderId=?',(p['OrderId'],)).fetchall()
        if o is None or sum((Decimal(str(i['UnitPrice']))*i['Quantity'] for i in items),Decimal(0))+Decimal(str(o[0]))!=Decimal(str(p['Amount'])):errors.append(p['Id'])
    return errors

def read_state(c,core,audit_ids=None):
    tables={t:table_rows(c,t) for t in ['Products','Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs','AdminUser','AdminSession']}
    migrations=table_rows(c,'__EFMigrationsHistory','MigrationId')
    kept=[p for p in tables['Products'] if p['Id'] not in core.LEGACY]
    remaining={'Orders':[o for o in tables['Orders'] if o['Id'] not in core.ORDERS],
        'OrderItems':[i for i in tables['OrderItems'] if i['OrderId'] not in core.ORDERS],
        'Payments':[p for p in tables['Payments'] if p['OrderId'] not in core.ORDERS],
        'PaymentRefunds':tables['PaymentRefunds']}
    existing_audits=tables['AdminAuditLogs'] if audit_ids is None else [a for a in tables['AdminAuditLogs'] if a['Id'] in audit_ids]
    metrics={'counts':{**{t:len(r) for t,r in tables.items()},'__EFMigrationsHistory':len(migrations)},
        'integrity':[r[0] for r in c.execute('PRAGMA integrity_check')],
        'foreignKeyFailures':[list(r) for r in c.execute('PRAGMA foreign_key_check')],
        'monetaryMismatchPaymentIds':monetary_errors(c),
        'allProductsSha256':core.digest(tables['Products']),'keptProductsSha256':core.digest(kept),
        'allFinancialRowsSha256':core.digest({t:tables[t] for t in ['Orders','OrderItems','Payments','PaymentRefunds']}),
        'remainingFinancialRowsSha256':core.digest(remaining),'originalAuditRowsSha256':core.digest(existing_audits),
        'migrationsSha256':core.digest(migrations)}
    return tables,migrations,metrics

def validate_receipt(core,receipt,snapshot,snapshot_tables):
    reasons=[]
    if receipt.get('mode')!='REHEARSAL-COPY-ONLY' or receipt.get('status')!='passed':reasons.append('receipt-not-passed-copy-only')
    for key in ['productionModified','productionDatabaseOpened','productionDeletionAuthorized']:
        if receipt.get(key) is not False:reasons.append('receipt-'+key)
    if receipt.get('reviewedExecutorSha256')!=EXECUTOR_SHA:reasons.append('receipt-executor-hash')
    if receipt.get('reviewedBackupSha256')!=core.BACKUP_SHA:reasons.append('receipt-backup-hash')
    if any(receipt.get('checks',{}).get(k) is not True for k in REQUIRED_CHECKS):reasons.append('receipt-required-checks')
    audit_ids={a['Id'] for a in snapshot_tables['AdminAuditLogs']}
    for key,counts in [('before',core.COUNTS),('afterDeletion',{'Products':15,'Orders':26,'OrderItems':33,'Payments':26,'PaymentRefunds':0,'AdminAuditLogs':23}),('afterReversal',{**core.COUNTS,'AdminAuditLogs':24})]:
        m=receipt.get(key,{})
        if any(m.get('counts',{}).get(t)!=n for t,n in counts.items()):reasons.append(key+'-counts')
        if m.get('integrity')!=['ok'] or m.get('foreignKeyFailures')!=[] or m.get('monetaryMismatchPaymentIds')!=[]:reasons.append(key+'-integrity-or-money')
        for field in ['keptProductsSha256','remainingFinancialRowsSha256','originalAuditRowsSha256','migrationsSha256']:
            if m.get(field)!=snapshot[field]:reasons.append(key+'-'+field)
    for key in ['before','afterReversal']:
        for field in ['allProductsSha256','allFinancialRowsSha256']:
            if receipt.get(key,{}).get(field)!=snapshot[field]:reasons.append(key+'-'+field)
    for field,prefix,section in [('deletionCopy','rehearsal-delete-copy-','afterDeletion'),('reversalCopy','rehearsal-reversal-copy-','afterReversal')]:
        p=pathlib.Path(receipt.get(field,''))
        if not p.is_absolute() or p.parent.resolve()!=core.BACKUP.parent.resolve() or not p.name.startswith(prefix) or p.suffix!='.db' or p.is_symlink() or not p.is_file():
            reasons.append(field+'-path');continue
        c=readonly(p)
        try:tables,migrations,m=read_state(c,core,audit_ids)
        finally:c.close()
        recorded=receipt.get(section,{})
        for key in ['counts','integrity','foreignKeyFailures','monetaryMismatchPaymentIds','allProductsSha256','keptProductsSha256','allFinancialRowsSha256','remainingFinancialRowsSha256','originalAuditRowsSha256','migrationsSha256']:
            if m[key]!=recorded.get(key):reasons.append(field+'-current-'+key)
        if any(tables[t]!=snapshot_tables[t] for t in ['AdminUser','AdminSession']):reasons.append(field+'-identity-or-sessions')
    return reasons

def inspect_readonly(core,production):
    if hashlib.sha256(core.BACKUP.read_bytes()).hexdigest()!=core.BACKUP_SHA:raise RuntimeError('Reviewed backup hash mismatch.')
    backup=readonly(core.BACKUP)
    try:snapshot_tables,snapshot_migrations,snapshot=read_state(backup,core)
    finally:backup.close()
    if snapshot['allFinancialRowsSha256']!=core.FINANCE_SHA or snapshot['keptProductsSha256']!=core.KEEP_SHA:raise RuntimeError('Reviewed backup logical fingerprints differ.')
    c=readonly(production)
    try:
        registered=c.execute('PRAGMA database_list').fetchone()['file']
        live_tables,live_migrations,live=read_state(c,core)
        triggers=c.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'").fetchone()[0]
        schema=[tuple(r) for r in c.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name")]
    finally:c.close()
    b=readonly(core.BACKUP)
    try:backup_schema=[tuple(r) for r in b.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name")]
    finally:b.close()
    unchanged={t:live_tables[t]==snapshot_tables[t] for t in ['Products','Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs']}
    candidates=[];accepted=None
    for p in sorted(core.BACKUP.parent.glob('copy-only-rehearsal-result-*.json'),key=lambda p:p.stat().st_mtime,reverse=True):
        try:
            receipt=json.loads(p.read_text(encoding='utf8'));reasons=validate_receipt(core,receipt,snapshot,snapshot_tables)
        except Exception as error:reasons=['receipt-read-or-validation-'+type(error).__name__]
        candidates.append({'path':str(p),'valid':not reasons,'reasons':reasons})
        if not reasons and accepted is None:accepted={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'checkedAt':receipt.get('checkedAt'),'executorSha256':receipt['reviewedExecutorSha256'],'backupSha256':receipt['reviewedBackupSha256']}
    changed_ids={}
    for t,same in unchanged.items():
        if same:continue
        old={r['Id']:r for r in snapshot_tables[t]};new={r['Id']:r for r in live_tables[t]}
        changed_ids[t]={'added':sorted(new.keys()-old.keys()),'removed':sorted(old.keys()-new.keys()),'changed':sorted(k for k in new.keys()&old.keys() if new[k]!=old[k])}
    checks={'databaseIdentity':pathlib.Path(registered).resolve()==pathlib.Path(production).resolve(),
        'backupIntegrity':snapshot['integrity']==['ok'] and not snapshot['foreignKeyFailures'] and not snapshot['monetaryMismatchPaymentIds'],
        'liveIntegrity':live['integrity']==['ok'] and not live['foreignKeyFailures'] and not live['monetaryMismatchPaymentIds'],
        'reviewedCounts':all(live['counts'][t]==n for t,n in core.COUNTS.items()),
        'allReviewedBusinessRowsUnchanged':all(unchanged.values()),'all15ProductFieldsAndCodesUnchanged':live['keptProductsSha256']==core.KEEP_SHA,
        'migrationsAndSchemaUnchanged':live_migrations==snapshot_migrations and schema==backup_schema,
        'noUnreviewedTriggers':triggers==0,'rehearsalReceiptAndCopiesVerified':accepted is not None}
    return {'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'READ-ONLY-FINAL-PREFLIGHT',
        'productionDatabase':str(production),'productionConnection':'mode=ro; PRAGMA query_only=ON; read transaction',
        'productionModified':False,'productionDeletionAuthorized':False,'executorSha256':EXECUTOR_SHA,
        'backup':{'path':str(core.BACKUP),'sha256':core.BACKUP_SHA},'checks':checks,'reviewedBusinessRowsUnchanged':unchanged,
        'changedRecordIds':changed_ids,'ownerMatchesBackup':live_tables['AdminUser']==snapshot_tables['AdminUser'],
        'sessionsMatchBackup':live_tables['AdminSession']==snapshot_tables['AdminSession'],
        'ownerOrSessionsModifiedByPreflight':False,'snapshotMetrics':snapshot,'liveMetrics':live,
        'verifiedReceipt':accepted,'receiptCandidates':candidates,'status':'passed' if all(checks.values()) else 'blocked'}

def load_executor():
    if EXECUTOR.is_symlink() or not EXECUTOR.is_file() or hashlib.sha256(EXECUTOR.read_bytes()).hexdigest()!=EXECUTOR_SHA:raise RuntimeError('Reviewed executor hash mismatch.')
    spec=importlib.util.spec_from_file_location('reviewed_catalog_executor',EXECUTOR)
    core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
    return core

def main():
    if len(sys.argv)>1:raise RuntimeError('Read-only preflight accepts no execution flags.')
    if PRODUCTION.is_symlink() or str(PRODUCTION.resolve(strict=True))!='/home/burgerhouse.db':raise RuntimeError('Production database identity not verified.')
    result=inspect_readonly(load_executor(),PRODUCTION)
    print(json.dumps(result));return 0 if result['status']=='passed' else 2

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:print(json.dumps({'status':'blocked','mode':'READ-ONLY-FINAL-PREFLIGHT','productionModified':False,'reason':str(error) if isinstance(error,RuntimeError) else type(error).__name__}));sys.exit(2)
