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
export async function initializeLanguage() {
  if (isTauri()) {
    // Subscribe before reading so other windows cannot leave this view stale.
    disposeListener = await listen<string>("language-changed", event => apply(event.payload));
    apply(await invoke<string>("get_app_language"));
  } else {
    try { apply(localStorage.getItem(storageKey)); } catch { apply("ru"); }
    const synchronize = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) apply(event.newValue); };
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
