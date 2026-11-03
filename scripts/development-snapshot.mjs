import { cp, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function usesDevelopmentSnapshot(args) {
  return args[0] === 'dev' && !args.some(arg => ['--live', '--help', '-h'].includes(arg));
}

export async function createDevelopmentSnapshot(root, temporaryRoot = tmpdir()) {
  const snapshot = await mkdtemp(path.join(temporaryRoot, 'git-ui-runtime-'));
  try {
    const sourceDirectories = new Set(['src', 'src-tauri', 'locales', 'scripts', 'public']);
    const configurationFiles = new Set(['package.json', 'package-lock.json', 'settings.json', 'index.html', 'tsconfig.json', 'tsconfig.node.json', 'postcss.config.js', 'postcss.config.cjs', 'tailwind.config.cjs', 'vite.config.ts', 'ui.config.json']);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && sourceDirectories.has(entry.name)) {
        await cp(path.join(root, entry.name), path.join(snapshot, entry.name), {
          recursive: true,
          filter: file => !['target', 'node_modules', '.git', '.updater'].includes(path.basename(file)),
        });
      } else if (entry.isFile() && configurationFiles.has(entry.name)) {
        await cp(path.join(root, entry.name), path.join(snapshot, entry.name));
      }
    }
    await mkdir(path.join(snapshot, 'src-tauri'), { recursive: true });
    await symlink(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    return snapshot;
  } catch (error) {
    await rm(snapshot, { recursive: true, force: true });
    throw error;
  }
}
