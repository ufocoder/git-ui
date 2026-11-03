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
    detail.textContent = download.detail;
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
    document.querySelector('#release-note').textContent = `${data.version} · macOS · Apple Silicon & Intel`;
  } else {
    document.querySelector('#release-note').textContent = 'The first release is on its way';
    document.querySelector('#download-footnote').textContent = 'Installers will appear here when a stable release is published';
    primary.firstChild.textContent = 'View downloads ';
  }
  // Browsers cannot reliably identify Apple Silicon vs Intel: offer both explicitly.
  if (data.downloads.some(item => item.url)) {
    primary.firstChild.textContent = 'Download for macOS ';
  }
} catch {
  list.replaceChildren();
  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'Check GitHub Releases for available installers';
  list.append(message);
  document.querySelector('#release-note').textContent = 'Find the latest version on GitHub Releases';
}
