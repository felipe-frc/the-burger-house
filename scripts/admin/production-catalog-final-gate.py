"""Final execution gate. Default is read-only; explicit later Owner approval required."""
import argparse, datetime, hashlib, importlib.util, json, os, pathlib, sqlite3

DIRECTORY=pathlib.Path('/home/backups/catalog-cleanup')
CHECKER=DIRECTORY/'production-final-preflight-ba2bb2600c317118.py'
CHECKER_SHA='ba2bb2600c3171186b689710a4f31aea0116b9fba73ffcbbb3bfde63113a5a6a'
RECEIPT=DIRECTORY/'copy-only-rehearsal-result-eb4c0ff110274c73a69857931fe04011.json'
RECEIPT_SHA='3a9872f98b135b2c0887ef1efa78e91f1e43336e20d662f596175f9e82a2215c'

def load_checker():
    if CHECKER.is_symlink() or not CHECKER.is_file() or hashlib.sha256(CHECKER.read_bytes()).hexdigest()!=CHECKER_SHA:raise RuntimeError('Read-only checker hash mismatch.')
    spec=importlib.util.spec_from_file_location('reviewed_readonly_checker',CHECKER)
    checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)
    return checker

def run_guarded_transaction(core,checker,c,proof,expected_tables,expected_migrations,safety_identity):
    original_check=core.check
    phases=[]
    def guarded_check(connection):
        if not connection.in_transaction:raise RuntimeError('Checks must execute inside the write transaction.')
        original_check(connection)
        tables,migrations,metrics=checker.read_state(connection,core)
        if not phases:
            if any(tables[t]!=expected_tables[t] for t in ['Products','Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs']):raise RuntimeError('Business records changed after preflight; transaction aborted.')
            if {t:tables[t] for t in ['AdminUser','AdminSession']}!=safety_identity:raise RuntimeError('Owner/session state changed after safety backup.')
            phases.append('reviewed-rows-checked-under-BEGIN-IMMEDIATE')
        else:
            if {t:tables[t] for t in ['AdminUser','AdminSession']}!=safety_identity:raise RuntimeError('Owner/session state modified during cleanup.')
            if metrics['keptProductsSha256']!=core.KEEP_SHA:raise RuntimeError('Definitive products changed.')
            phases.append('post-delete-identity-and-integrity-checked-before-COMMIT')
        if migrations!=expected_migrations:raise RuntimeError('Migration history changed.')
    core.check=guarded_check
    try:counts=core.execute_transaction(c,proof)
    finally:core.check=original_check
    return counts,phases

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--execute-approved',action='store_true');parser.add_argument('--approval-reference');args=parser.parse_args()
    checker=load_checker();core=checker.load_executor()
    if str(checker.PRODUCTION.resolve(strict=True))!='/home/burgerhouse.db' or checker.PRODUCTION.is_symlink():raise RuntimeError('Production identity not verified.')
    report=checker.inspect_readonly(core,checker.PRODUCTION)
    if not RECEIPT.is_file() or RECEIPT.is_symlink() or hashlib.sha256(RECEIPT.read_bytes()).hexdigest()!=RECEIPT_SHA:raise RuntimeError('Verified rehearsal receipt changed.')
    if report['status']!='passed' or report['verifiedReceipt']['path']!=str(RECEIPT):raise RuntimeError('Final read-only preflight blocked.')
    if not args.execute_approved:
        print(json.dumps({'mode':'READ-ONLY-FINAL-GATE','productionModified':False,'readyForSeparateOwnerAuthorization':True,'verifiedReceipt':report['verifiedReceipt']}));return
    if not args.approval_reference or len(args.approval_reference)>160:raise RuntimeError('Specific final Owner authorization reference required.')
    source=checker.readonly(core.BACKUP)
    try:expected_tables,expected_migrations,_=checker.read_state(source,core)
    finally:source.close()
    safety=DIRECTORY/('final-cleanup-safety-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+os.urandom(8).hex()+'.db')
    fd=os.open(safety,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    live=checker.readonly(checker.PRODUCTION)
    try:
        tables,_,_=checker.read_state(live,core)
        if any(tables[t]!=expected_tables[t] for t in ['Products','Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs']):raise RuntimeError('Records changed before safety backup.')
        safety_identity={t:tables[t] for t in ['AdminUser','AdminSession']}
        target=sqlite3.connect(safety)
        try:live.backup(target)
        finally:target.close()
    finally:live.close()
    verification=checker.readonly(safety)
    try:
        safety_tables,_,safety_metrics=checker.read_state(verification,core)
        if safety_metrics['integrity']!=['ok'] or safety_metrics['foreignKeyFailures'] or safety_metrics['monetaryMismatchPaymentIds']:raise RuntimeError('Fresh safety backup failed integrity.')
        if any(safety_tables[t]!=expected_tables[t] for t in ['Products','Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs']):raise RuntimeError('Fresh safety backup differs from reviewed state.')
    finally:verification.close()
    proof={'path':str(safety),'sha256':hashlib.sha256(safety.read_bytes()).hexdigest(),'approvalReference':args.approval_reference,'verifiedRehearsalReceipt':str(RECEIPT),'verifiedRehearsalReceiptSha256':RECEIPT_SHA,'reviewedExecutorSha256':checker.EXECUTOR_SHA}
    c=sqlite3.connect(checker.PRODUCTION)
    try:counts,phases=run_guarded_transaction(core,checker,c,proof,expected_tables,expected_migrations,safety_identity)
    finally:c.close()
    result={'mode':'APPROVED-PRODUCTION-CATALOG-CLEANUP','committed':True,'productionModified':True,'approvalReference':args.approval_reference,'countsAfterCommit':counts,'backup':proof,'transactionChecks':phases,'postApiAndOwnerVerification':'required-next; no automatic rollback after commit'}
    print(json.dumps(result))

if __name__=='__main__':main()
