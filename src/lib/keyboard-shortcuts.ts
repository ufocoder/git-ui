import { t } from "./i18n.ts";

type Chord = { key: string; primary?: boolean; shift?: boolean };
type Shortcut = { chords: Chord[]; description: () => string };

export const shortcuts = {
  refresh: { chords: [{ key: "r", primary: true }], description: () => t("key03") },
  help: { chords: [{ key: "F1" }], description: () => t("key04") },
  selectCommit: { chords: [{ key: "Enter" }, { key: " " }], description: () => t("key05") },
  dismiss: { chords: [{ key: "Escape" }], description: () => t("key06") },
  focus: { chords: [{ key: "Tab" }, { key: "Tab", shift: true }], description: () => t("key07") },
  sidebarResize: {
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }, { key: "ArrowLeft", shift: true }, { key: "ArrowRight", shift: true }],
    description: () => t("key08"),
  },
  sidebarBounds: { chords: [{ key: "Home" }, { key: "End" }], description: () => t("key09") },
  panelBounds: {
    chords: [{ key: "Home" }, { key: "End" }, { key: "ArrowLeft", shift: true }, { key: "ArrowRight", shift: true }, { key: "ArrowUp", shift: true }, { key: "ArrowDown", shift: true }],
    description: () => t("key12"),
  },
  panelResize: { chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }, { key: "ArrowUp" }, { key: "ArrowDown" }], description: () => t("key10") },
} satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof shortcuts;
type KeyEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

export function matchesShortcut(id: ShortcutId, event: KeyEvent): boolean {
  return (shortcuts[id].chords as Chord[]).some(chord =>
    event.key.toLowerCase() === chord.key.toLowerCase()
    && Boolean(event.metaKey || event.ctrlKey) === Boolean(chord.primary)
    && event.shiftKey === Boolean(chord.shift) && !event.altKey);
}

export function shortcutLabels(id: ShortcutId, mac: boolean): string[] {
  const names: Record<string, string> = { " ": t("key11"), Escape: "Esc", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
  return (shortcuts[id].chords as Chord[]).map(chord =>
    `${chord.primary ? mac ? "⌘" : "Ctrl+" : ""}${chord.shift ? "Shift+" : ""}${names[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key)}`);
}
