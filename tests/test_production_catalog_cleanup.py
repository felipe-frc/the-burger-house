"""Transactional scope tests on fabricated in-memory data, never Azure data."""
import importlib.util, json, pathlib, sqlite3, unittest, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]

class CleanupProcedureTests(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('prepared_cleanup',ROOT/'scripts/admin/production-catalog-cleanup.py')
        self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.c=sqlite3.connect(':memory:');c=self.c;c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
        c.executescript('''
        CREATE TABLE Products(Id INTEGER PRIMARY KEY,Code TEXT UNIQUE,Name TEXT);
        CREATE TABLE Orders(Id INTEGER PRIMARY KEY,Status INTEGER,DeliveryFee TEXT);
        CREATE TABLE OrderItems(Id INTEGER PRIMARY KEY,OrderId INTEGER REFERENCES Orders(Id) ON DELETE CASCADE,ProductId INTEGER REFERENCES Products(Id) ON DELETE RESTRICT,Quantity INTEGER,UnitPrice TEXT);
        CREATE TABLE Payments(Id INTEGER PRIMARY KEY,OrderId INTEGER REFERENCES Orders(Id) ON DELETE CASCADE,Status INTEGER,Amount TEXT);
        CREATE TABLE PaymentRefunds(Id INTEGER PRIMARY KEY,PaymentId INTEGER REFERENCES Payments(Id) ON DELETE RESTRICT);
        CREATE TABLE AdminAuditLogs(Id INTEGER PRIMARY KEY,AdminUserId INTEGER,ActorType TEXT,Action TEXT,EntityType TEXT,EntityId TEXT,Changes TEXT,CreatedAtUtc TEXT);
        CREATE TABLE __EFMigrationsHistory(MigrationId TEXT PRIMARY KEY,ProductVersion TEXT);
        ''')
        codes=json.loads((ROOT/'scripts/admin/definitive-catalog.json').read_text())['keepCodes']
        identities=dict(zip([1,2,3,14,15,16,7,17,18,10,19,20,21,22,23],codes));identities.update(self.m.LEGACY)
        c.executemany('INSERT INTO Products VALUES (?,?,?)',[(i,code,'Fixture '+str(i)) for i,code in sorted(identities.items())])
        kept_orders=[i for i in range(1,100) if i not in self.m.ORDERS][:26]
        all_orders=self.m.ORDERS+kept_orders
        c.executemany('INSERT INTO Orders VALUES (?,2,?)',[(i,'0.0') for i in all_orders])
        groups={1:[1],2:[2],24:[31,32,33],25:[34,35,36],28:[39,40,41],29:[42,43],30:[44,45],31:[46],32:[47,48],34:[50]}
        legacy=iter([4]*5+[5]*3+[6]+[8]*2+[9]*3+[11]*3)
        items=[(item,order,1 if item in [43,45] else next(legacy),1,'1.0') for order,ids in groups.items() for item in ids]
        remaining_ids=[i for i in range(1,100) if i not in self.m.ITEMS][:33]
        items.extend((i,kept_orders[n%26],14,1,'1.0') for n,i in enumerate(remaining_ids))
        c.executemany('INSERT INTO OrderItems VALUES (?,?,?,?,?)',items)
        c.executemany('INSERT INTO Payments VALUES (?,?,2,?)',[(i,i,str(sum(item[1]==i for item in items))) for i in all_orders])
        c.executemany("INSERT INTO AdminAuditLogs VALUES (?,NULL,'System','Fixture','Product','12','{}','2026-10-28')",[(i,) for i in range(1,23)])
        c.executemany('INSERT INTO __EFMigrationsHistory VALUES (?,?)',[('fixture-'+str(i),'9') for i in range(23)])
        c.commit();self.m.FINANCE_SHA=self.m.finance(c);self.m.KEEP_SHA=self.m.digest(self.m.rows(c,'SELECT * FROM Products WHERE Id NOT IN ('+self.m.marks(self.m.LEGACY)+') ORDER BY Id',tuple(self.m.LEGACY)))

    def tearDown(self):self.c.close()

    def test_exact_scope_preserves_kept_products_remaining_history_and_all_existing_audits(self):
        result=self.m.execute_transaction(self.c,{'path':'fixture-only','sha256':'fixture'})
        self.assertEqual(result,{'Products':15,'Orders':26,'OrderItems':33,'Payments':26,'PaymentRefunds':0,'AdminAuditLogs':23})
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM __EFMigrationsHistory').fetchone()[0],23)
        self.assertFalse(list(self.c.execute('PRAGMA foreign_key_check')))
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM Products WHERE Id=1').fetchone()[0],1)

    def test_refuses_financial_changes_before_any_delete(self):
        self.c.execute("UPDATE Payments SET Amount='99' WHERE Id=1");self.c.commit()
        with self.assertRaisesRegex(RuntimeError,'Reviewed records changed'):self.m.execute_transaction(self.c,{})
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM Products').fetchone()[0],23)

    def test_refuses_unreviewed_cascading_product_dependency(self):
        self.c.execute('CREATE TABLE NewRelation(Id INTEGER,ProductId INTEGER REFERENCES Products(Id) ON DELETE CASCADE)');self.c.commit()
        with self.assertRaisesRegex(RuntimeError,'Unexpected product dependency'):self.m.execute_transaction(self.c,{})
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM Orders').fetchone()[0],36)

    def test_failure_after_deletes_rolls_back_whole_transaction(self):
        self.c.execute("UPDATE Payments SET Amount='99' WHERE Id=3");self.c.commit();self.m.FINANCE_SHA=self.m.finance(self.c)
        with self.assertRaisesRegex(RuntimeError,'Monetary mismatch'):self.m.execute_transaction(self.c,{})
        for table,count in self.m.COUNTS.items():self.assertEqual(self.c.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],count)

    def test_inverse_transaction_restores_history_without_deleting_audit_trail(self):
        with tempfile.TemporaryDirectory() as directory:
            backup=pathlib.Path(directory)/'fixture.db';target=sqlite3.connect(backup);self.c.backup(target);target.close()
            self.m.execute_transaction(self.c,{'path':'fixture-only'})
            self.m.rollback_reviewed_deletion(self.c,backup,'fixture-rollback')
            for table,count in self.m.COUNTS.items():self.assertEqual(self.c.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],count+2 if table=='AdminAuditLogs' else count)
            self.assertEqual(self.m.finance(self.c),self.m.FINANCE_SHA)

if __name__=='__main__':unittest.main()
