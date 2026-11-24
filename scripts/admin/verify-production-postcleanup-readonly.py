"""Post-cleanup verification only. All database connections use mode=ro/query_only."""
import datetime, hashlib, importlib.util, json, pathlib, sys
sys.dont_write_bytecode=True
root=pathlib.Path('/home/backups/catalog-cleanup')
checker_path=root/'production-final-preflight-ba2bb2600c317118.py'
checker_sha='ba2bb2600c3171186b689710a4f31aea0116b9fba73ffcbbb3bfde63113a5a6a'
if checker_path.is_symlink() or hashlib.sha256(checker_path.read_bytes()).hexdigest()!=checker_sha:raise RuntimeError('Reviewed checker hash mismatch.')
spec=importlib.util.spec_from_file_location('readonly_checker',checker_path)
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)
core=checker.load_executor()
if hashlib.sha256(core.BACKUP.read_bytes()).hexdigest()!=core.BACKUP_SHA:raise RuntimeError('Original backup hash mismatch.')
if checker.PRODUCTION.is_symlink() or str(checker.PRODUCTION.resolve(strict=True))!='/home/burgerhouse.db':raise RuntimeError('Database identity mismatch.')
def snapshot(path):
    c=checker.readonly(path)
    try:
        data=checker.read_state(c,core)
        schema=checker.table_rows(c,'sqlite_master','name')
        return data,schema
    finally:c.close()
(before,before_migrations,before_metrics),before_schema=snapshot(core.BACKUP)
(now,migrations,metrics),schema=snapshot(checker.PRODUCTION)
expected={
    'Products':[p for p in before['Products'] if p['Id'] not in core.LEGACY],
    'Orders':[p for p in before['Orders'] if p['Id'] not in core.ORDERS],
    'OrderItems':[p for p in before['OrderItems'] if p['Id'] not in core.ITEMS],
    'Payments':[p for p in before['Payments'] if p['Id'] not in core.ORDERS],
    'PaymentRefunds':before['PaymentRefunds']}
audit_ids={a['Id'] for a in before['AdminAuditLogs']}
original_audits=[a for a in now['AdminAuditLogs'] if a['Id'] in audit_ids]
new_audits=[a for a in now['AdminAuditLogs'] if a['Id'] not in audit_ids]
maintenance=[a for a in new_audits if a['Action']=='LegacyCatalogCleanup']
checks={
    'expectedCounts':all(metrics['counts'][t]==n for t,n in {'Products':15,'Orders':26,'OrderItems':33,'Payments':26,'PaymentRefunds':0,'AdminAuditLogs':23,'AdminUser':1,'__EFMigrationsHistory':23}.items()),
    'remainingRecordsExactlyPreserved':all(now[t]==expected[t] for t in expected),
    'all15ProductFieldsAndCodesUnchanged':now['Products']==expected['Products'] and metrics['keptProductsSha256']==core.KEEP_SHA,
    'legacyProductsAbsent':not any(p['Id'] in core.LEGACY for p in now['Products']),
    'removedOrdersAndPaymentsAbsent':not any(p['Id'] in core.ORDERS for t in ['Orders','Payments'] for p in now[t]),
    'integrityOk':metrics['integrity']==['ok'],
    'foreignKeysOk':not metrics['foreignKeyFailures'],
    'financialAmountsOk':not metrics['monetaryMismatchPaymentIds'],
    'noOrdersWithoutItems':all(any(i['OrderId']==o['Id'] for i in now['OrderItems']) for o in now['Orders']),
    'onePaymentPerRemainingOrder':all(sum(p['OrderId']==o['Id'] for p in now['Payments'])==1 for o in now['Orders']),
    'migrationsAndSchemaUnchanged':migrations==before_migrations and schema==before_schema,
    'ownerUnchanged':now['AdminUser']==before['AdminUser'],
    'all22OriginalAuditsUnchanged':original_audits==before['AdminAuditLogs'],
    'onlyOneNewMaintenanceAudit':len(new_audits)==len(maintenance)==1}
backup_result={'foundFromMaintenanceAudit':False}
if len(maintenance)==1:
    proof=json.loads(maintenance[0]['Changes'])['backup']
    safety=pathlib.Path(proof['path'])
    if safety.is_symlink() or safety.parent!=root or not safety.name.startswith('final-cleanup-safety-'):raise RuntimeError('Unexpected safety backup identity.')
    sha=hashlib.sha256(safety.read_bytes()).hexdigest()
    (safety_tables,safety_migrations,safety_metrics),_=snapshot(safety)
    backup_result={'foundFromMaintenanceAudit':True,'path':str(safety),'sha256':sha,'recordedSha256Matches':sha==proof['sha256'],'integrity':safety_metrics['integrity'],'foreignKeyFailures':safety_metrics['foreignKeyFailures'],'financialMismatches':safety_metrics['monetaryMismatchPaymentIds'],'reviewedRecordsMatch':all(safety_tables[t]==before[t] for t in ['Products','Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs'])}
checks['additionalBackupVerified']=backup_result.get('recordedSha256Matches',False) and backup_result.get('integrity')==['ok'] and backup_result.get('foreignKeyFailures')==[] and backup_result.get('financialMismatches')==[] and backup_result.get('reviewedRecordsMatch',False)
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'POST-CLEANUP-READONLY','productionModified':False,'counts':metrics['counts'],'checks':checks,'additionalBackup':backup_result,'fingerprints':{k:v for k,v in metrics.items() if k.endswith('Sha256')},'status':'passed' if all(checks.values()) else 'blocked'}
print(json.dumps(result,ensure_ascii=False))
