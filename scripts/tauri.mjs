import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevelopmentSnapshot, usesDevelopmentSnapshot } from './development-snapshot.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const isolated = usesDevelopmentSnapshot(args);
const snapshot = isolated ? await createDevelopmentSnapshot(root) : null;
const cli = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
const forwarded = args[0] === 'dev' ? args.filter(arg => arg !== '--live') : args;
const environment = { ...process.env };
if (isolated) {
  // Reuse compiled dependencies, but embed assets and locale data from the snapshot.
  environment.CARGO_TARGET_DIR = path.resolve(root, environment.CARGO_TARGET_DIR || 'src-tauri/target');
  console.log('Starting Git UI from an isolated development snapshot. Switching branches in the original repository is safe.');
  console.log('Restart this command to pick up source changes, or use dev --live for hot reload.');
}
let child;
try {
  child = spawn(process.execPath, [cli, ...forwarded], {
    cwd: snapshot || root, env: environment, stdio: 'inherit', windowsHide: true,
    detached: process.platform !== 'win32',
  });
  const forwardSignal = signal => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch { /* The child may already have exited. */ }
  };
  const interrupt = () => forwardSignal('SIGINT');
  const terminate = () => forwardSignal('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 1)));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
} finally {
  if (snapshot) await rm(snapshot, { recursive: true, force: true });
}
