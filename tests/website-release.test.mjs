import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseData } from '../website/scripts/release.mjs';
const repository = 'ufocoder/git-ui';
const asset = name => ({ name, state: 'uploaded', browser_download_url: `https://github.com/${repository}/releases/download/v1.2.3/${name}` });

test('maps stable release installers to macOS and Windows x64 without choosing signatures or updater archives', () => {
  const data = releaseData(repository, { tag_name: 'v1.2.3', assets: ['git-ui_aarch64.dmg.sig', 'git-ui_aarch64.app.tar.gz', 'git-ui_1.2.3_aarch64.dmg', 'git-ui_1.2.3_x64.dmg', 'git-ui_1.2.3_x64-setup.exe.sig', 'git-ui_1.2.3_arm64-setup.exe', 'git-ui_1.2.3_x64-setup.exe', 'git-ui_1.2.3_amd64.AppImage'].map(asset) });
  assert.equal(data.version, 'v1.2.3');
  assert.equal(data.downloads.filter(item => item.url).length, 3);
  assert.deepEqual(data.downloads.map(item => item.id), ['mac-arm', 'mac-intel', 'windows-x64']);
  assert.match(data.downloads[0].url, /aarch64\.dmg$/);
  assert.match(data.downloads[1].url, /x64\.dmg$/);
  assert.match(data.downloads[2].url, /x64-setup\.exe$/);
});

test('unpublished, prerelease and missing assets have no download links', () => {
  for (const release of [null, { draft: true }, { prerelease: true }]) {
    const data = releaseData(repository, release);
    assert.equal(data.version, null);
    assert.ok(data.downloads.every(item => item.url === null));
  }
  assert.ok(releaseData(repository, { tag_name: 'v1' }).downloads.every(item => item.url === null));
});

test('rejects download URLs outside the configured repository', () => {
  const file = asset('git-ui_aarch64.dmg');
  file.browser_download_url = 'https://example.com/installer.dmg';
  assert.equal(releaseData(repository, { tag_name: 'v1', assets: [file] }).downloads[0].url, null);
  assert.throws(() => releaseData('../wrong', null), /Invalid repository/);
});
