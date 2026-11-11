import { createSignal } from "solid-js";

function numericPreference(key: string, choices: readonly number[], fallback: number) {
  const storageKey = `git-ui.${key}`;
  let initial = fallback;
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (choices.includes(saved)) initial = saved;
  } catch { /* Storage is optional. */ }

  const [value, setValue] = createSignal(initial);
  return {
    value,
    choices,
    save(next: number) {
      if (!choices.includes(next)) return;
      setValue(next);
      try { localStorage.setItem(storageKey, String(next)); } catch { /* Storage is optional. */ }
    },
  };
}

export const uiFontScale = numericPreference("ui-font-scale", [0.85, 0.925, 1, 1.075, 1.15], 1);
