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
    const size = formatFileSize(download.size);
    detail.textContent = download.detail;
    label.append(detail);
    row.append(label);
    const action = document.createElement(download.url ? 'a' : 'span');
    if (download.url) {
      action.href = download.url;
      action.textContent = size ? `Download · ${size} ↓` : 'Download ↓';
      action.setAttribute('aria-label', `Download for ${download.name} ${download.detail}${size ? `, ${size}` : ""}`);
    } else {
      action.className = 'unavailable';
      action.textContent = 'Coming soon';
    }
    row.append(action);
    list.append(row);
  }
  if (data.version) {
    document.querySelector('#version').textContent = data.version;
    const heroVersion = document.querySelector('#hero-version');
    heroVersion.textContent = data.version;
    heroVersion.hidden = false;
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
  if (!client?.getHighEntropyValues) return;

  // The ordinary macOS user agent can report Intel even on Apple Silicon.
  const hints = await client.getHighEntropyValues(['architecture', 'bitness']).catch(() => null);
  if (hints?.bitness !== '64') return;

  const recommendations = {
    'macOS:arm': ['mac-arm', 'Download for Apple Silicon'],
    'macOS:x86': ['mac-intel', 'Download for Intel Mac'],
    'Windows:x86': ['windows-x64', 'Download for Windows x64'],
  };
  const recommendation = recommendations[`${client.platform}:${hints.architecture}`];
  if (!recommendation) return;

  const [platform, label] = recommendation;
  const installer = downloads.find(item => item.id === platform && item.url);
  if (!installer) return;

  primary.href = installer.url;
  const size = formatFileSize(installer.size);
  primary.firstChild.textContent = size ? `${label} · ${size} ` : `${label} `;
}


function formatFileSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
  return new Intl.NumberFormat(document.documentElement.lang || undefined, {
    style: 'unit',
    unit: 'megabyte',
    maximumSignificantDigits: 3,
  }).format(bytes / 1_000_000);
}
