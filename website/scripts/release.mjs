export const platforms = [
  { id: 'mac-arm', name: 'macOS', detail: 'Apple Silicon · .dmg', match: /(?:aarch64|arm64).*\.dmg$/i },
  { id: 'mac-intel', name: 'macOS', detail: 'Intel · .dmg', match: /(?:x64|x86_64).*\.dmg$/i },
  { id: 'windows-x64', name: 'Windows', detail: 'x64 · .exe', match: /_(?:x64|x86_64)-setup\.exe$/i },
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
      const downloadUrl = url?.startsWith(`${base}/releases/download/`) ? url : null;
      const size = downloadUrl && Number.isSafeInteger(asset.size) && asset.size > 0 ? asset.size : null;
      return { id, name, detail, url: downloadUrl, size };
    }),
  };
}
