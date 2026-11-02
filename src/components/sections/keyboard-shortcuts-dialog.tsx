import { For, Show } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { shortcuts, shortcutLabels, type ShortcutId } from "~/lib/keyboard-shortcuts";
import { t } from "~/lib/i18n";

export default function KeyboardShortcutsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <Show when={props.open}><DialogContent class="max-h-[85dvh] sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("key01")}</DialogTitle>
        <DialogDescription>{t("key02")}</DialogDescription>
      </DialogHeader>
      <dl class="divide-y text-sm">
        <For each={Object.keys(shortcuts) as ShortcutId[]}>{id =>
          <div class="flex items-start justify-between gap-6 py-3">
            <dt class="min-w-0 text-muted-foreground">{shortcuts[id].description()}</dt>
            <dd class="flex max-w-[45%] shrink-0 flex-wrap justify-end gap-1">
              <For each={shortcutLabels(id, mac)}>{label => <kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">{label}</kbd>}</For>
            </dd>
          </div>
        }</For>
      </dl>
    </DialogContent></Show>
  </Dialog>;
}
