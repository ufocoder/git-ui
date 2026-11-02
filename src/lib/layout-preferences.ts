import { createContext, useContext, type Accessor } from "solid-js";

export const LayoutScope = createContext<Accessor<string>>(() => "global");
export const useLayoutScope = () => useContext(LayoutScope);
export const panelStorageKey = (scope: string, id: string) => `git-ui.layout.v1:${scope}:${id}`;

export function validPanelSizes(value: unknown, count: number): value is number[] {
  return Array.isArray(value) && value.length === count && value.every(size => typeof size === "number" && Number.isFinite(size) && size > 0 && size < 1)
    && Math.abs(value.reduce((total, size) => total + size, 0) - 1) < 0.001;
}
export function readPanelSizes(scope: string, id: string, defaults: number[]): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(panelStorageKey(scope, id)) ?? "null");
    return validPanelSizes(value, defaults.length) ? value : [...defaults];
  } catch { return [...defaults]; }
}
export function savePanelSizes(scope: string, id: string, sizes: number[], count: number) {
  if (!validPanelSizes(sizes, count)) return;
  try { localStorage.setItem(panelStorageKey(scope, id), JSON.stringify(sizes)); } catch { /* Layout preferences must not interrupt Git work. */ }
}
export function readSidebarWidth() {
  try { const width = Number(localStorage.getItem("git-ui.sidebar-width")); return width >= 180 && width <= 480 ? width : 256; }
  catch { return 256; }
}
export function saveSidebarWidth(width: number) {
  try { localStorage.setItem("git-ui.sidebar-width", String(width)); } catch { /* Optional preference. */ }
}
