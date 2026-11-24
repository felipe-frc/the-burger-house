import { defineConfig } from 'vitest/config';
import path from 'node:path';
// Explicit historical diagnostic; do not require a full Git history in normal CI.
export default defineConfig({
 test:{environment:'jsdom',include:['tests/acceptance/pagbank-legacy-contract.test.ts']},
 resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}},
});
