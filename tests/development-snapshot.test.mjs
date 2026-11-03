import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDevelopmentSnapshot, usesDevelopmentSnapshot } from '../scripts/development-snapshot.mjs';

test('only dev uses snapshots, leaving builds and explicit live mode untouched', () => {
  assert.equal(usesDevelopmentSnapshot(['dev']), true);
  for (const args of [['build'], ['bundle'], ['dev', '--live'], ['dev', '--help']]) assert.equal(usesDevelopmentSnapshot(args), false);
});

test('source snapshot survives branch-like replacements without copying secrets or build outputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'git-ui-snapshot-test-'));
  let snapshot;
  try {
    for (const folder of ['src', 'src-tauri/target', 'locales', 'node_modules', '.updater', '.git']) await mkdir(path.join(root, folder), { recursive: true });
    await writeFile(path.join(root, 'src/app.tsx'), 'original interface');
    await writeFile(path.join(root, 'src-tauri/lib.rs'), 'original backend');
    await writeFile(path.join(root, 'src-tauri/target/output'), 'compiled');
    await writeFile(path.join(root, '.updater/key'), 'secret');
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(root, 'private-settings.json'), 'secret');
    snapshot = await createDevelopmentSnapshot(root);
    await writeFile(path.join(root, 'src/app.tsx'), 'different branch');
    await rm(path.join(root, 'src-tauri/lib.rs'));
    assert.equal(await readFile(path.join(snapshot, 'src/app.tsx'), 'utf8'), 'original interface');
    assert.equal(await readFile(path.join(snapshot, 'src-tauri/lib.rs'), 'utf8'), 'original backend');
    for (const excluded of ['.git', '.updater', 'private-settings.json', 'src-tauri/target']) await assert.rejects(lstat(path.join(snapshot, excluded)), { code: 'ENOENT' });
    assert.equal((await lstat(path.join(snapshot, 'node_modules'))).isSymbolicLink(), true);
  } finally {
    if (snapshot) await rm(snapshot, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
