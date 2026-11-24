"""Prepared only. Default rehearses on a COPY of the reviewed backup; never runs against production without explicit approved mode."""
import argparse, datetime, hashlib, json, os, pathlib, sqlite3, uuid
from decimal import Decimal

BACKUP=pathlib.Path('/home/backups/catalog-cleanup/catalog-before-cleanup-bfb1b0eff42f4178ac2f090c162453ff.db')
BACKUP_SHA='84df07466eb2b12949aa21aee7a48225514180132a06bf401673ffde42336d32'
FINANCE_SHA='437971f65bfd6c604be9e3102caa1838c3b4238e72a1cbd863371384e8fe7248'
KEEP_SHA='ffc7b8a8a34a9da7e87716ad9f1e25ed0c8faff5d81c508680401969c0dcbe13'
LEGACY={4:'burger-outback-king',5:'burger-chicken-grill-supreme',6:'burger-joia-da-coroa',8:'side-batata-rustica',9:'side-aneis-cebola',11:'drink-guarana-antarctica',12:'fanta-uva-136037b67405',13:'pao-da-casa-4c1c5cfc8d71'}
ORDERS=[1,2,24,25,28,29,30,31,32,34]
ITEMS=[1,2,31,32,33,34,35,36,39,40,41,42,43,44,45,46,47,48,50]
COUNTS={'Products':23,'Orders':36,'OrderItems':52,'Payments':36,'PaymentRefunds':0,'AdminAuditLogs':22}

def rows(c,sql,args=()):return [dict(r) for r in c.execute(sql,args)]
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,default=str).encode()).hexdigest()
def finance(c):return digest({t:rows(c,'SELECT * FROM '+t+' ORDER BY Id') for t in ['Orders','OrderItems','Payments','PaymentRefunds']})
def marks(values):return ','.join('?' for _ in values)
def check(c):
    if c.execute('PRAGMA foreign_keys').fetchone()[0]!=1:raise RuntimeError('Foreign keys must stay enabled.')
    if [r[0] for r in c.execute('PRAGMA integrity_check')]!=['ok'] or list(c.execute('PRAGMA foreign_key_check')):raise RuntimeError('Integrity failed.')

def execute_transaction(c,backup_proof):
    c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');c.execute('BEGIN IMMEDIATE')
    try:
        check(c)
        if c.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'").fetchone()[0]:raise RuntimeError('Database triggers require explicit impact review.')
        if any(c.execute('SELECT COUNT(*) FROM '+t).fetchone()[0]!=n for t,n in COUNTS.items()):raise RuntimeError('Counts changed: fresh impact review required.')
        products=rows(c,'SELECT * FROM Products ORDER BY Id')
        kept=[p for p in products if p['Id'] not in LEGACY]
        if len(kept)!=15 or digest(kept)!=KEEP_SHA or finance(c)!=FINANCE_SHA:raise RuntimeError('Reviewed records changed.')
        if {p['Id']:p['Code'] for p in products if p['Id'] in LEGACY}!=LEGACY:raise RuntimeError('Product identity mismatch.')
        affected=[r[0] for r in c.execute('SELECT DISTINCT OrderId FROM OrderItems WHERE ProductId IN ('+marks(LEGACY)+') ORDER BY OrderId',tuple(LEGACY))]
        items=[r[0] for r in c.execute('SELECT Id FROM OrderItems WHERE OrderId IN ('+marks(ORDERS)+') ORDER BY Id',ORDERS)]
        payments=[r[0] for r in c.execute('SELECT Id FROM Payments WHERE OrderId IN ('+marks(ORDERS)+') ORDER BY Id',ORDERS)]
        if affected!=ORDERS or items!=ITEMS or payments!=ORDERS:raise RuntimeError('Dependency set changed.')
        # Refuse any new/cascading product relationship not present in the review.
        for name, in c.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            safe='"'+name.replace('"','""')+'"'
            for fk in c.execute('PRAGMA foreign_key_list('+safe+')'):
                if fk[2]=='Products' and (name!='OrderItems' or fk[3]!='ProductId' or fk[6]!='RESTRICT'):raise RuntimeError('Unexpected product dependency.')
        remaining_orders=rows(c,'SELECT * FROM Orders WHERE Id NOT IN ('+marks(ORDERS)+') ORDER BY Id',ORDERS)
        remaining_items=rows(c,'SELECT * FROM OrderItems WHERE OrderId NOT IN ('+marks(ORDERS)+') ORDER BY Id',ORDERS)
        remaining_payments=rows(c,'SELECT * FROM Payments WHERE OrderId NOT IN ('+marks(ORDERS)+') ORDER BY Id',ORDERS)
        existing_audits=rows(c,'SELECT * FROM AdminAuditLogs ORDER BY Id')
        migration_ids=rows(c,'SELECT * FROM __EFMigrationsHistory ORDER BY MigrationId')
        # Whole orders, never a partial removal that changes their monetary sum.
        c.execute('DELETE FROM Payments WHERE Id IN ('+marks(ORDERS)+')',ORDERS)
        c.execute('DELETE FROM OrderItems WHERE Id IN ('+marks(ITEMS)+')',ITEMS)
        c.execute('DELETE FROM Orders WHERE Id IN ('+marks(ORDERS)+')',ORDERS)
        c.execute('DELETE FROM Products WHERE Id IN ('+marks(LEGACY)+')',tuple(LEGACY))
        expected={'Products':15,'Orders':26,'OrderItems':33,'Payments':26,'PaymentRefunds':0,'AdminAuditLogs':22}
        if any(c.execute('SELECT COUNT(*) FROM '+t).fetchone()[0]!=n for t,n in expected.items()):raise RuntimeError('Unexpected final counts.')
        if rows(c,'SELECT * FROM Products ORDER BY Id')!=kept or rows(c,'SELECT * FROM Orders ORDER BY Id')!=remaining_orders or rows(c,'SELECT * FROM OrderItems ORDER BY Id')!=remaining_items or rows(c,'SELECT * FROM Payments ORDER BY Id')!=remaining_payments or rows(c,'SELECT * FROM AdminAuditLogs ORDER BY Id')!=existing_audits or rows(c,'SELECT * FROM __EFMigrationsHistory ORDER BY MigrationId')!=migration_ids:raise RuntimeError('Kept records changed.')
        for p in remaining_payments:
            # SQLite's canonical numeric cast; all retained monetary rows above
            # must also remain byte-for-byte identical to the reviewed state.
            total=sum((Decimal(str(i['UnitPrice']))*i['Quantity'] for i in rows(c,'SELECT Quantity,UnitPrice FROM OrderItems WHERE OrderId=?',(p['OrderId'],))),Decimal(0))
            fee=c.execute('SELECT DeliveryFee FROM Orders WHERE Id=?',(p['OrderId'],)).fetchone()[0]
            if total+Decimal(str(fee))!=Decimal(str(p['Amount'])):raise RuntimeError('Monetary mismatch.')
        change=json.dumps({'removedProductIds':list(LEGACY),'removedOrderIds':ORDERS,'removedPaymentIds':ORDERS,'removedOrderItemIds':ITEMS,'backup':backup_proof,'keptProductsUnchanged':True})
        c.execute('INSERT INTO AdminAuditLogs (AdminUserId,ActorType,Action,EntityType,EntityId,Changes,CreatedAtUtc) VALUES (NULL,?,?,?,?,?,?)',('System','LegacyCatalogCleanup','Catalog','2.0',change,datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')))
        check(c);c.commit();expected['AdminAuditLogs']=23
        return expected
    except:c.rollback();raise

def rollback_reviewed_deletion(c,reviewed_backup,approval_reference):
    source=sqlite3.connect(pathlib.Path(reviewed_backup).as_uri()+'?mode=ro',uri=True);source.row_factory=sqlite3.Row
    c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');c.execute('BEGIN IMMEDIATE')
    try:
        check(c)
        if not c.execute("SELECT COUNT(*) FROM AdminAuditLogs WHERE Action='LegacyCatalogCleanup'").fetchone()[0]:raise RuntimeError('No recorded cleanup to reverse.')
        kept=rows(c,'SELECT * FROM Products WHERE Id NOT IN ('+marks(LEGACY)+') ORDER BY Id',tuple(LEGACY))
        if digest(kept)!=KEEP_SHA:raise RuntimeError('Kept catalog changed; manual rollback review required.')
        for table,column,ids in [('Products','Id',list(LEGACY)),('Orders','Id',ORDERS),('OrderItems','Id',ITEMS),('Payments','Id',ORDERS)]:
            if c.execute('SELECT COUNT(*) FROM '+table+' WHERE '+column+' IN ('+marks(ids)+')',ids).fetchone()[0]:raise RuntimeError('Rollback identity collision; refusing overwrite.')
            original=rows(source,'SELECT * FROM '+table+' WHERE '+column+' IN ('+marks(ids)+') ORDER BY Id',ids)
            if len(original)!=len(ids):raise RuntimeError('Reviewed backup is incomplete.')
            for row in original:
                columns=list(row);names=','.join('"'+k.replace('"','""')+'"' for k in columns)
                c.execute('INSERT INTO '+table+' ('+names+') VALUES ('+marks(columns)+')',tuple(row[k] for k in columns))
        check(c)
        if digest(rows(c,'SELECT * FROM Products WHERE Id NOT IN ('+marks(LEGACY)+') ORDER BY Id',tuple(LEGACY)))!=KEEP_SHA:raise RuntimeError('Rollback changed kept products.')
        changes=json.dumps({'restoredProductIds':list(LEGACY),'restoredOrderIds':ORDERS,'restoredPaymentIds':ORDERS,'reviewedBackup':str(reviewed_backup),'approvalReference':approval_reference})
        c.execute('INSERT INTO AdminAuditLogs (AdminUserId,ActorType,Action,EntityType,EntityId,Changes,CreatedAtUtc) VALUES (NULL,?,?,?,?,?,?)',('System','LegacyCatalogCleanupRolledBack','Catalog','2.0',changes,datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')))
        c.commit();return {'restoredProducts':8,'restoredOrders':10,'restoredOrderItems':19,'restoredPayments':10,'existingAuditsPreserved':True}
    except:c.rollback();raise
    finally:source.close()

def main():
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group();group.add_argument('--execute-approved',action='store_true');group.add_argument('--rollback-approved',action='store_true');parser.add_argument('--approval-reference');args=parser.parse_args()
    if os.name=='nt' or not BACKUP.is_file() or hashlib.sha256(BACKUP.read_bytes()).hexdigest()!=BACKUP_SHA:raise RuntimeError('Reviewed Azure backup not verified.')
    production=pathlib.Path('/home/burgerhouse.db').resolve(strict=True)
    if str(production)!='/home/burgerhouse.db':raise RuntimeError('Production identity not verified.')
    if args.rollback_approved:
        if not args.approval_reference:raise RuntimeError('Approved rollback reference required.')
        c=sqlite3.connect(production)
        try:result=rollback_reviewed_deletion(c,BACKUP,args.approval_reference)
        finally:c.close()
        print(json.dumps({'mode':'APPROVED-ROLLBACK','productionModified':True,'result':result}));return
    script_sha=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
    receipt_path=BACKUP.parent/('rehearsal-approved-scope-'+script_sha[:16]+'.json')
    if args.execute_approved:
        if not args.approval_reference:raise RuntimeError('Specific owner approval reference required.')
        if not receipt_path.is_file():raise RuntimeError('Run the copy-only rehearsal before any approved execution.')
        receipt=json.loads(receipt_path.read_text())
        if receipt.get('scriptSha256')!=script_sha or receipt.get('reviewedBackupSha256')!=BACKUP_SHA or receipt.get('productionModified') is not False:raise RuntimeError('Rehearsal receipt does not match reviewed procedure.')
        target=production
        source=sqlite3.connect(production.as_uri()+'?mode=ro',uri=True)
        safety=BACKUP.parent/('approved-cleanup-safety-'+uuid.uuid4().hex+'.db')
    else:
        source=sqlite3.connect(BACKUP.as_uri()+'?mode=ro',uri=True)
        target=BACKUP.parent/('rehearsal-copy-'+uuid.uuid4().hex+'.db');safety=target
    fd=os.open(safety,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    dest=sqlite3.connect(safety);source.backup(dest);source.close();dest.close()
    proof={'path':str(safety),'sha256':hashlib.sha256(safety.read_bytes()).hexdigest(),'approvalReference':args.approval_reference}
    c=sqlite3.connect(target)
    try:expected=execute_transaction(c,proof)
    finally:c.close()
    result={'mode':'APPROVED-PRODUCTION' if args.execute_approved else 'REHEARSAL-COPY-ONLY','productionModified':bool(args.execute_approved),'target':str(target),'backup':proof,'countsAfter':expected,'scriptSha256':script_sha,'reviewedBackupSha256':BACKUP_SHA}
    if not args.execute_approved:
        fd=os.open(receipt_path,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as output:json.dump(result,output)
    print(json.dumps(result))

if __name__=='__main__':main()
