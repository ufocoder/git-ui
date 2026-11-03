export const platforms = [
  { id: 'mac-arm', name: 'macOS', detail: 'Apple Silicon · .dmg', match: /(?:aarch64|arm64).*\.dmg$/i },
  { id: 'mac-intel', name: 'macOS', detail: 'Intel · .dmg', match: /(?:x64|x86_64).*\.dmg$/i },
  { id: 'windows', name: 'Windows', detail: '64-bit · .exe', match: /(?:x64|x86_64).*\.exe$/i },
  { id: 'linux', name: 'Linux', detail: '64-bit · .AppImage', match: /(?:amd64|x86_64|x64).*\.AppImage$/i },
];

export function releaseData(repository, release) {
  if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(repository)) throw new Error('Invalid repository');
  const base = `https://github.com/${repository}`;
  const published = release && !release.draft && !release.prerelease;
  return {
    repository: base,
    version: published ? release.tag_name : null,
    release: published ? `${base}/releases/tag/${encodeURIComponent(release.tag_name)}` : `${base}/releases`,
    downloads: platforms.map(({ id, name, detail, match }) => {
      const asset = published ? release.assets?.find(item => match.test(item.name) && item.state === 'uploaded') : null;
      const url = asset?.browser_download_url;
      return { id, name, detail, url: url?.startsWith(`${base}/releases/download/`) ? url : null };
    }),
  };
}
