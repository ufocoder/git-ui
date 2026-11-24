import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('discard controller transitions with Solid browser reactivity',()=>{
 execFileSync(process.execPath,['--conditions=browser','--experimental-strip-types','--test',fileURLToPath(new URL('./browser/discard-changes.test.mjs',import.meta.url))],{stdio:'pipe'});
});
