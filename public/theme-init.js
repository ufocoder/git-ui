/* Synchronous theme bootstrap: run before CSS so saved dark themes do not flash white. */
(() => {
  const key = "git-ui.theme";
  const themes = [
    { id: "default", name: "Default", dark: false },
    { id: "dark", name: "Dark", dark: true },
    { id: "night-owl-light", name: "Night Owl Light", dark: false },
    { id: "rose-pine-moon", name: "Rosé Pine Moon", dark: true },
    { id: "noctis-hibernus", name: "Noctis Hibernus", dark: false },
    { id: "macos-modern-light", name: "macOS Modern Light", dark: false },
  ];
  const normalize = value => themes.some(theme => theme.id === value) ? value : "default";
  let current = "default";
  try { current = normalize(localStorage.getItem(key)); } catch { /* Use the default if storage is unavailable. */ }
  function apply(value) {
    current = normalize(value);
    const theme = themes.find(theme => theme.id === current);
    document.documentElement.dataset.theme = current;
    document.documentElement.dataset.kbTheme = theme.dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme.dark);
    window.dispatchEvent(new CustomEvent("git-ui-theme-changed", { detail: current }));
  }
  window.gitUiTheme = {
    themes,
    get: () => current,
    set(value) {
      const next = normalize(value);
      try { localStorage.setItem(key, next); } catch { /* Keep the session preference. */ }
      apply(next);
    },
  };
  window.addEventListener("storage", event => { if (event.key === key || event.key === null) apply(event.key === null ? null : event.newValue); });
  apply(current);
})();
