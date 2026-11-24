"""Test the copy-only runner with fabricated data; never uses Azure or live DBs."""
import contextlib, hashlib, importlib.util, io, json, pathlib, runpy, sqlite3, sys, tempfile, unittest
from unittest.mock import patch
import test_production_catalog_cleanup as fixture_module

ROOT = pathlib.Path(__file__).resolve().parents[1]

class CopyOnlyRunnerTests(unittest.TestCase):
    def setUp(self):
        with contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(ROOT/'scripts/admin/build-copy-only-rehearsal.py'))
        spec=importlib.util.spec_from_file_location('copy_only_runner',ROOT/'test-results/catalog-final/production-copy-only-rehearsal.py')
        self.runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.runner)
        self.fixture=fixture_module.CleanupProcedureTests('test_exact_scope_preserves_kept_products_remaining_history_and_all_existing_audits')
        self.fixture.setUp();c=self.fixture.c
        c.executescript('CREATE TABLE AdminUser(Id INTEGER PRIMARY KEY,FixtureMarker TEXT); CREATE TABLE AdminSession(Id INTEGER PRIMARY KEY,FixtureMarker TEXT);')
        c.execute("INSERT INTO AdminUser VALUES (1,'fabricated-owner')");c.execute("INSERT INTO AdminSession VALUES (1,'fabricated-session')");c.commit()
        self.directory=tempfile.TemporaryDirectory();self.backup=pathlib.Path(self.directory.name)/'reviewed-fixture.db'
        target=sqlite3.connect(self.backup);c.backup(target);target.close()
        self.runner.BACKUP=self.backup;self.runner.BACKUP_SHA=hashlib.sha256(self.backup.read_bytes()).hexdigest()
        self.runner.FINANCE_SHA=self.fixture.m.finance(c);self.runner.KEEP_SHA=self.fixture.m.KEEP_SHA

    def tearDown(self):
        self.fixture.tearDown();self.directory.cleanup()

    def test_deletion_and_reversal_run_only_on_two_new_copies(self):
        output=io.StringIO()
        with patch.object(sys,'argv',['copy-only-fixture']),contextlib.redirect_stdout(output):self.runner.copy_only_main()
        result=json.loads(output.getvalue())
        self.assertEqual(result['mode'],'REHEARSAL-COPY-ONLY');self.assertEqual(result['status'],'passed')
        self.assertFalse(result['productionDatabaseOpened']);self.assertFalse(result['productionModified'])
        self.assertTrue(all(result['checks'].values()))
        self.assertEqual(result['before']['counts']['Products'],23)
        self.assertEqual(result['afterDeletion']['counts']['Products'],15)
        self.assertEqual(result['afterReversal']['counts']['Products'],23)
        self.assertEqual(result['afterReversal']['counts']['Payments'],36)
        self.assertEqual(result['afterReversal']['counts']['AdminAuditLogs'],24)
        self.assertEqual(hashlib.sha256(self.backup.read_bytes()).hexdigest(),self.runner.BACKUP_SHA)
        self.assertNotEqual(pathlib.Path(result['deletionCopy']),self.backup)
        self.assertNotEqual(result['deletionCopy'],result['reversalCopy'])

    def test_apply_flag_is_rejected_without_any_copy_or_write(self):
        before=set(pathlib.Path(self.directory.name).iterdir())
        with patch.object(sys,'argv',['copy-only-fixture','--execute-approved']),self.assertRaisesRegex(RuntimeError,'accepts no apply'):
            self.runner.copy_only_main()
        self.assertEqual(set(pathlib.Path(self.directory.name).iterdir()),before)

    def test_changed_backup_is_refused_before_any_copy(self):
        self.runner.BACKUP_SHA='0'*64
        with patch.object(sys,'argv',['copy-only-fixture']),self.assertRaisesRegex(RuntimeError,'backup not verified'):
            self.runner.copy_only_main()
        self.assertEqual(len(list(pathlib.Path(self.directory.name).iterdir())),1)

    def prepare_readonly_preflight(self):
        with patch.object(sys,'argv',['copy-only-fixture']),contextlib.redirect_stdout(io.StringIO()):self.runner.copy_only_main()
        production=pathlib.Path(self.directory.name)/'fabricated-production.db'
        source=sqlite3.connect(self.backup);target=sqlite3.connect(production);source.backup(target);source.close();target.close()
        spec=importlib.util.spec_from_file_location('readonly_preflight',ROOT/'scripts/admin/production-final-preflight.py')
        preflight=importlib.util.module_from_spec(spec);spec.loader.exec_module(preflight)
        return preflight,production

    def test_final_preflight_verifies_actual_receipt_and_copy_files_without_writes(self):
        preflight,production=self.prepare_readonly_preflight();before=hashlib.sha256(production.read_bytes()).hexdigest()
        result=preflight.inspect_readonly(self.runner,production)
        self.assertEqual(result['status'],'passed');self.assertTrue(all(result['checks'].values()))
        self.assertFalse(result['productionModified']);self.assertFalse(result['productionDeletionAuthorized'])
        self.assertEqual(hashlib.sha256(production.read_bytes()).hexdigest(),before)
        c=preflight.readonly(production)
        try:
            with self.assertRaises(sqlite3.OperationalError):c.execute("UPDATE Products SET Name='must-not-write'")
        finally:c.close()

    def test_final_preflight_rejects_receipt_for_another_executor(self):
        preflight,production=self.prepare_readonly_preflight()
        receipt=next(pathlib.Path(self.directory.name).glob('copy-only-rehearsal-result-*.json'))
        data=json.loads(receipt.read_text());data['reviewedExecutorSha256']='0'*64;receipt.write_text(json.dumps(data))
        result=preflight.inspect_readonly(self.runner,production)
        self.assertEqual(result['status'],'blocked');self.assertFalse(result['checks']['rehearsalReceiptAndCopiesVerified'])

    def run_final_gate_fixture(self, mutate_before=False, fail_before_commit=False):
        preflight,production=self.prepare_readonly_preflight()
        spec=importlib.util.spec_from_file_location('final_gate',ROOT/'scripts/admin/production-catalog-final-gate.py')
        gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
        c=preflight.readonly(self.backup)
        tables,migrations,_=preflight.read_state(c,self.runner);c.close()
        identity={t:tables[t] for t in ['AdminUser','AdminSession']}
        c=sqlite3.connect(production);c.row_factory=sqlite3.Row
        if mutate_before:
            c.execute("UPDATE Products SET Name='changed after preflight' WHERE Id=4");c.commit()
        real_read=preflight.read_state
        def read_with_failure(connection,core):
            state=real_read(connection,core)
            if fail_before_commit and len(state[0]['Products'])==15:raise RuntimeError('fabricated post-delete failure')
            return state
        try:
            with patch.object(preflight,'read_state',read_with_failure):
                if mutate_before or fail_before_commit:
                    with self.assertRaises(RuntimeError):gate.run_guarded_transaction(self.runner,preflight,c,{'fixture':True},tables,migrations,identity)
                    self.assertFalse(c.in_transaction)
                    self.assertEqual(c.execute('SELECT COUNT(*) FROM Products').fetchone()[0],23)
                    self.assertEqual(c.execute('SELECT COUNT(*) FROM Payments').fetchone()[0],36)
                    self.assertEqual(c.execute('SELECT COUNT(*) FROM AdminAuditLogs').fetchone()[0],22)
                else:
                    counts,phases=gate.run_guarded_transaction(self.runner,preflight,c,{'fixture':True},tables,migrations,identity)
                    self.assertEqual(counts['Products'],15);self.assertEqual(counts['AdminAuditLogs'],23)
                    self.assertEqual(len(phases),2)
                    self.assertEqual(preflight.table_rows(c,'AdminUser'),identity['AdminUser'])
                    self.assertEqual(preflight.table_rows(c,'AdminSession'),identity['AdminSession'])
        finally:c.close()

    def test_final_gate_commits_only_reviewed_scope_on_fabricated_copy(self):self.run_final_gate_fixture()

    def test_final_gate_blocks_changes_after_readonly_preflight(self):self.run_final_gate_fixture(mutate_before=True)

    def test_final_gate_rolls_back_post_delete_failure_before_commit(self):self.run_final_gate_fixture(fail_before_commit=True)

    def test_final_preflight_detects_nonfinancial_product_field_change(self):
        preflight,production=self.prepare_readonly_preflight();c=sqlite3.connect(production)
        c.execute("UPDATE Products SET Name='changed-after-inventory' WHERE Id=4");c.commit();c.close()
        result=preflight.inspect_readonly(self.runner,production)
        self.assertEqual(result['status'],'blocked');self.assertFalse(result['checks']['allReviewedBusinessRowsUnchanged'])
        self.assertEqual(result['changedRecordIds']['Products']['changed'],[4])

if __name__=='__main__':unittest.main()
