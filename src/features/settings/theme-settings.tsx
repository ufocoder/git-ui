import { For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { DialogFooter } from "~/components/ui/dialog";
import ThemePreview from "~/components/sections/theme-preview";
import { themes, theme, saveTheme } from "~/lib/theme-preferences";
import { t } from "~/lib/i18n";

export default function ThemeSettings(props: { draft: string; select: (theme: string) => void }) {
  return <>
    <fieldset class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <legend class="sr-only">{t("theme.title")}</legend>
      <For each={themes}>{item => (
        <label class="relative min-w-0 cursor-pointer">
          <input
            type="radio"
            name="app-color-theme"
            class="peer sr-only"
            value={item.id}
            checked={props.draft === item.id}
            onChange={() => props.select(item.id)}
          />
          <span class="block space-y-2 rounded-lg border p-2 hover:bg-muted peer-checked:border-primary peer-checked:bg-muted peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-primary">
            <span class="flex items-center justify-between gap-2 px-1 text-sm font-medium">
              {item.id === "default" ? t("theme.light") : item.id === "dark" ? t("theme.dark") : item.name}
              <Show when={props.draft === item.id}><span aria-hidden="true" class="text-primary">✓</span></Show>
            </span>
            <ThemePreview theme={item.id} dark={item.dark} />
          </span>
        </label>
      )}</For>
    </fieldset>
    <DialogFooter class="gap-2">
      <Button type="button" disabled={props.draft === theme()} onClick={() => saveTheme(props.draft)}>{t("theme.apply")}</Button>
    </DialogFooter>
  </>;
}
