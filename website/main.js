const list = document.querySelector('#download-list');
const primary = document.querySelector('#primary-download');
const allReleases = document.querySelector('#all-releases');

try {
  const response = await fetch('./release.json');
  if (!response.ok) throw new Error('Download metadata unavailable');
  const data = await response.json();
  document.querySelectorAll('[data-repository]').forEach(link => { link.href = data.repository; });
  allReleases.href = data.release;
  list.replaceChildren();
  for (const download of data.downloads) {
    const row = document.createElement('div');
    row.className = 'download-row';
    const label = document.createElement('div');
    label.textContent = download.name;
    const detail = document.createElement('small');
    const size = Number.isSafeInteger(download.size) && download.size > 0
      ? new Intl.NumberFormat(document.documentElement.lang || undefined, {
          style: 'unit',
          unit: 'megabyte',
          maximumSignificantDigits: 3,
        }).format(download.size / 1_000_000)
      : null;
    detail.textContent = size ? `${download.detail} · ${size}` : download.detail;
    label.append(detail);
    row.append(label);
    const action = document.createElement(download.url ? 'a' : 'span');
    if (download.url) {
      action.href = download.url;
      action.textContent = 'Download ↓';
      action.setAttribute('aria-label', `Download for ${download.name} ${download.detail}`);
    } else {
      action.className = 'unavailable';
      action.textContent = 'Coming soon';
    }
    row.append(action);
    list.append(row);
  }
  if (data.version) {
    document.querySelector('#version').textContent = data.version;
  } else {
    document.querySelector('#download-footnote').textContent = 'Installers will appear here when a stable release is published';
  }
  void recommendInstaller(data.downloads);
} catch {
  list.replaceChildren();
  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'Check GitHub Releases for available installers';
  list.append(message);
}


async function recommendInstaller(downloads) {
  const client = navigator.userAgentData;
  if (client?.platform !== 'macOS' || !client.getHighEntropyValues) return;

  // The ordinary macOS user agent can report Intel even on Apple Silicon.
  const hints = await client.getHighEntropyValues(['architecture', 'bitness']).catch(() => null);
  if (hints?.bitness !== '64') return;

  const platform = hints.architecture === 'arm' ? 'mac-arm'
    : hints.architecture === 'x86' ? 'mac-intel'
    : null;
  const installer = downloads.find(item => item.id === platform && item.url);
  if (!installer) return;

  primary.href = installer.url;
  primary.firstChild.textContent = platform === 'mac-arm'
    ? 'Download for Apple Silicon '
    : 'Download for Intel Mac ';
}
