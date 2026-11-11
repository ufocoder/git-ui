import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { normalizeLanguage, setLanguage, type Language } from "./i18n";

const storageKey = "git-ui.language";
let disposeListener: (() => void) | undefined;
function apply(value: unknown) {
  const next = normalizeLanguage(value);
  setLanguage(next);
  document.documentElement.lang = next;
}
function preferredLanguage(): Language {
  for (const tag of navigator.languages.length ? navigator.languages : [navigator.language]) {
    const code = tag.split(/[-_]/)[0].toLowerCase();
    if (code === "ru" || code === "en") return code;
  }
  return "ru";
}
export async function initializeLanguage() {
  if (isTauri()) {
    // Subscribe before reading so other windows cannot leave this view stale.
    disposeListener = await listen<string>("language-changed", event => apply(event.payload)).catch(error => { console.error(error); return undefined; });
    apply(await invoke<string>("get_app_language", { preferredLanguage: preferredLanguage() }));
  } else {
    try { apply(localStorage.getItem(storageKey) ?? preferredLanguage()); } catch { apply(preferredLanguage()); }
    const synchronize = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) apply(event.newValue ?? preferredLanguage()); };
    window.addEventListener("storage", synchronize);
    disposeListener = () => window.removeEventListener("storage", synchronize);
  }
}
export async function saveLanguage(value: Language) {
  if (isTauri()) await invoke("set_app_language", { language: value });
  else localStorage.setItem(storageKey, value);
  apply(value);
}
import.meta.hot?.dispose(() => disposeListener?.());
