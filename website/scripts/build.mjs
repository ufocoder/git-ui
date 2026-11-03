import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { releaseData } from './release.mjs';

const root = new URL('../', import.meta.url);
const settings = JSON.parse(await readFile(new URL('../../settings.json', import.meta.url), 'utf8'));
const repository = process.env.GITHUB_REPOSITORY || new URL(settings.updates.repository).pathname.replace(/^\/|\/$/g, '');
let release = null;
if (!process.argv.includes('--offline')) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 404 && !response.ok) throw new Error(`GitHub release lookup failed (${response.status})`);
  if (response.ok) release = await response.json();
}
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'main.js', 'assets']) await cp(new URL(file, root), new URL(file, output), { recursive: true });
await writeFile(new URL('release.json', output), JSON.stringify(releaseData(repository, release), null, 2) + '\n');
console.log(`Built ${fileURLToPath(output)}${release ? ` for ${release.tag_name}` : ' (no published release)'}`);
