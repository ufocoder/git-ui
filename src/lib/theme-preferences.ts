import { createSignal } from "solid-js";

type ThemeDefinition = { id: string; name: string; dark: boolean };
declare global {
  interface Window {
    gitUiTheme: { themes: ThemeDefinition[]; get: () => string; set: (value: string) => void };
  }
}
export const themes = window.gitUiTheme.themes;
export const [theme, setTheme] = createSignal(window.gitUiTheme.get());
const synchronize = () => setTheme(window.gitUiTheme.get());
window.addEventListener("git-ui-theme-changed", synchronize);
export function saveTheme(value: string) { window.gitUiTheme.set(value); }
import.meta.hot?.dispose(() => window.removeEventListener("git-ui-theme-changed", synchronize));
