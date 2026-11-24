"""Catalog inventory and guarded local cleanup. Default: production read-only backup/report."""
import datetime, hashlib, json, os, pathlib, sqlite3, sys, uuid
from decimal import Decimal

KEEP_CODES = None  # Generated standalone SSH collector embeds the reviewed 15-code manifest.

def quoted(name):
    return '"' + name.replace('"', '""') + '"'

def digest(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()

def rows(c, sql, args=()):
    return [dict(r) for r in c.execute(sql, args)]

def inspect(c, keep):
    products = rows(c, 'SELECT * FROM Products ORDER BY Id')
    if len(keep) != 15 or len(set(keep)) != 15 or any(sum(p['Code'] == code for p in products) != 1 for code in keep):
        raise RuntimeError('Missing, duplicate or ambiguous definitive product identity.')
    tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    foreign = {t: rows(c, 'PRAGMA foreign_key_list(' + quoted(t) + ')') for t in tables}
    inventory, order_ids = [], set()
    for p in products:
        items = rows(c, 'SELECT Id,OrderId,Quantity FROM OrderItems WHERE ProductId=?', (p['Id'],))
        legacy = p['Code'] not in keep
        if legacy: order_ids.update(i['OrderId'] for i in items)
        dependencies = []
        for table, keys in foreign.items():
            for fk in keys:
                if fk['table'] == 'Products':
                    count = c.execute('SELECT COUNT(*) FROM ' + quoted(table) + ' WHERE ' + quoted(fk['from']) + '=?', (p['Id'],)).fetchone()[0]
                    dependencies.append({'table': table, 'column': fk['from'], 'count': count, 'onDelete': fk['on_delete']})
        inventory.append({'id':p['Id'],'code':p['Code'],'name':p['Name'],'category':p['Category'],'isActive':bool(p['IsActive']),
            'decision':'EXCLUIR' if legacy else 'MANTER','orderCount':len(set(i['OrderId'] for i in items)),'orderItemCount':len(items),'historicalQuantity':sum(i['Quantity'] for i in items),
            'imageDependencies':{k:p[k] for k in p if 'image' in k.lower()},'inlineTranslations':{'englishName':bool(p.get('EnglishName')),'englishDescription':bool(p.get('EnglishDescription'))},
            'productAuditCount':c.execute("SELECT COUNT(*) FROM AdminAuditLogs WHERE EntityType='Product' AND EntityId=?",(str(p['Id']),)).fetchone()[0],'foreignKeyDependencies':dependencies})
    affected_orders, affected_payment_ids = [], []
    for order_id in sorted(order_ids):
        o = dict(c.execute('SELECT Id,Status,DeliveryFee FROM Orders WHERE Id=?',(order_id,)).fetchone())
        items = rows(c,'SELECT oi.Id,oi.ProductId,oi.Quantity,oi.UnitPrice,p.Code FROM OrderItems oi JOIN Products p ON p.Id=oi.ProductId WHERE OrderId=?',(order_id,))
        payments = rows(c,'SELECT Id,Status,Method,Amount FROM Payments WHERE OrderId=?',(order_id,))
        affected_payment_ids += [p['Id'] for p in payments]
        o.update({'total':str(sum(Decimal(str(i['UnitPrice']))*i['Quantity'] for i in items)+Decimal(str(o['DeliveryFee']))),'legacyItemIds':[i['Id'] for i in items if i['Code'] not in keep],'keptItemIds':[i['Id'] for i in items if i['Code'] in keep],'payments':payments})
        affected_orders.append(o)
    mismatches=[]
    for p in rows(c,'SELECT Id,OrderId,Amount FROM Payments'):
        o=c.execute('SELECT DeliveryFee FROM Orders WHERE Id=?',(p['OrderId'],)).fetchone()
        if o is None: mismatches.append(p['Id']); continue
        total=sum((Decimal(str(r['UnitPrice']))*r['Quantity'] for r in rows(c,'SELECT UnitPrice,Quantity FROM OrderItems WHERE OrderId=?',(p['OrderId'],))),Decimal(0))+Decimal(str(o[0]))
        if total != Decimal(str(p['Amount'])): mismatches.append(p['Id'])
    legacy_ids=[p['id'] for p in inventory if p['decision']=='EXCLUIR']
    product_audits=rows(c,"SELECT Id,EntityType,EntityId,Action FROM AdminAuditLogs WHERE EntityType='Product' AND EntityId IN ("+','.join('?' for _ in legacy_ids)+')',tuple(map(str,legacy_ids))) if legacy_ids else []
    related_audits=rows(c,'SELECT Id,EntityType,EntityId,Action FROM AdminAuditLogs')
    related_audits=[a for a in related_audits if a['EntityType']=='Order' and a['EntityId'] in set(map(str,order_ids)) or a['EntityType']=='Payment' and a['EntityId'] in set(map(str,affected_payment_ids))]
    refunds=[r['Id'] for r in rows(c,'SELECT Id,PaymentId FROM PaymentRefunds') if r['PaymentId'] in affected_payment_ids]
    return {'products':inventory,'counts':{t:c.execute('SELECT COUNT(*) FROM '+quoted(t)).fetchone()[0] for t in tables},'foreignKeys':foreign,
        'integrity':[r[0] for r in c.execute('PRAGMA integrity_check')],'foreignKeyFailures':[list(r) for r in c.execute('PRAGMA foreign_key_check')],
        'monetaryMismatchPaymentIds':mismatches,'affectedOrders':affected_orders,'affectedPaymentIds':affected_payment_ids,'affectedRefundIds':refunds,
        'legacyProductAuditRows':product_audits,'relatedOrderPaymentAuditRows':related_audits,
        'keptProductsSha256':digest([p for p in products if p['Code'] in keep]),'financeSha256':digest({t:rows(c,'SELECT * FROM '+quoted(t)+' ORDER BY Id') for t in ['Orders','OrderItems','Payments','PaymentRefunds']}),
        'migrationIds':[r[0] for r in c.execute('SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId')]}

def snapshot(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    target=sqlite3.connect(destination);source.backup(target)
    if [r[0] for r in target.execute('PRAGMA integrity_check')] != ['ok']: raise RuntimeError('Snapshot integrity failed.')
    target.close()
    return {'path':str(destination),'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'integrity':'ok'}

def main():
    local='--inventory-local' in sys.argv or '--apply-local' in sys.argv
    if local:
        root=pathlib.Path('test-results/acceptance/homologation-path.txt').read_text().strip()
        source=pathlib.Path(root).resolve()/ 'burgerhouse.homologation.db'
        allowed=pathlib.Path('test-results/acceptance').resolve()
        if os.name!='nt' or not source.is_relative_to(allowed) or not source.parent.name.startswith('burgerhouse-homologation-') or source.name!='burgerhouse.homologation.db': raise RuntimeError('Local database guard failed.')
        manifest=json.loads(pathlib.Path('test-results/catalog-final/manifest.json').read_text(encoding='utf-8-sig'));keep=manifest['keepCodes']
        output=pathlib.Path('test-results/catalog-final')
    else:
        source=pathlib.Path('/home/burgerhouse.db').resolve(strict=True)
        if str(source)!='/home/burgerhouse.db' or not KEEP_CODES: raise RuntimeError('Production read-only collector requires generated manifest and exact existing path.')
        keep=KEEP_CODES
    c=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True);c.row_factory=sqlite3.Row;c.execute('BEGIN')
    before=inspect(c,keep)
    result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':str(source),'productionModified':False,'before':before}
    if not local or '--apply-local' in sys.argv:
        backup=(source.parent/'backups' if local else pathlib.Path('/home/backups/catalog-cleanup'))/('catalog-before-cleanup-'+uuid.uuid4().hex+'.db')
        result['backup']=snapshot(c,backup)
    c.close()
    if '--apply-local' in sys.argv:
        finance=json.loads(pathlib.Path('test-results/catalog-final/financial-closeout.json').read_text(encoding='utf-8-sig'))
        if not finance.get('validated'): raise RuntimeError('Financial evidence must be consolidated first.')
        c=sqlite3.connect(source);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');c.execute('BEGIN IMMEDIATE')
        try:
            locked=inspect(c,keep)
            if locked!=before: raise RuntimeError('Database changed after inventory; no cleanup performed.')
            legacy=[p for p in before['products'] if p['decision']=='EXCLUIR']
            if len(legacy)!=8 or before['affectedOrders'] or any(d['count'] for p in legacy for d in p['foreignKeyDependencies']): raise RuntimeError('Unexpected legacy dependencies: explicit treatment required.')
            for p in legacy:
                cur=c.execute('DELETE FROM Products WHERE Id=? AND Code=?',(p['id'],p['code']))
                if cur.rowcount!=1: raise RuntimeError('Product identity changed.')
            after=inspect(c,keep)
            if len(after['products'])!=15 or after['keptProductsSha256']!=before['keptProductsSha256'] or after['financeSha256']!=before['financeSha256'] or after['migrationIds']!=before['migrationIds'] or after['integrity']!=['ok'] or after['foreignKeyFailures'] or after['monetaryMismatchPaymentIds']: raise RuntimeError('Post-cleanup verification failed.')
            c.commit();result.update({'deleted':legacy,'after':after,'localCleanupCommitted':True})
        except: c.rollback();raise
        finally:c.close()
    if local:
        (output/('local-cleanup.json' if '--apply-local' in sys.argv else 'local-inventory.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__': main()
