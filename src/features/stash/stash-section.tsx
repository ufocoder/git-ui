import { Portal } from "solid-js/web";
import { For, Show, createSignal } from "solid-js";
import { locale, t } from "~/lib/i18n";
import type { History, StashAction, StashEntry } from "~/lib/git";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { SidebarGroupContent } from "~/components/ui/sidebar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

type Action = { kind: "save" } | { kind: "apply" | "drop"; entry: StashEntry };
export default function StashSection(props: { actionsMount?: HTMLDivElement; history: History; selected?: string; onSelect?: (entry: StashEntry) => void; disabled: boolean; onAction: (action: StashAction) => Promise<void> }) {
  const [action, setAction] = createSignal<Action>();
  const [message, setMessage] = createSignal("");
  const [includeUntracked, setIncludeUntracked] = createSignal(true);
  const [restoreIndex, setRestoreIndex] = createSignal(true);
  const [pending, setPending] = createSignal(false);
  const entry = () => { const current = action(); return current && current.kind !== "save" ? current.entry : undefined; };
  const title = () => action()?.kind === "save" ? t("stash02") : action()?.kind === "drop" ? t("stash09") : t("stash08");
  function open(next: Action) {
    if (props.disabled || pending()) return;
    setMessage(""); setIncludeUntracked(true); setRestoreIndex(true); setAction(next);
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const current = action();
    if (!current || pending() || props.disabled) return;
    setPending(true);
    try {
      const operation: StashAction = current.kind === "save" ? { kind: "save", message: message().trim(), include_untracked: includeUntracked() }
        : current.kind === "apply" ? { kind: "apply", id: current.entry.id, restore_index: restoreIndex() }
        : { kind: "drop", id: current.entry.id, confirmed: true };
      await props.onAction(operation);
      setAction(undefined);
    } catch { setAction(undefined); /* Errors are displayed by the terminal. */ }
    finally { setPending(false); }
  }
  return <>
    <Show when={props.actionsMount}><Portal mount={props.actionsMount}><div class="flex items-center gap-2"><Button size="sm" class="h-control-toolbar" disabled={props.disabled || pending() || !props.selected} onClick={() => { const saved = props.history.stashes.find(item => item.id === props.selected); if (saved) open({ kind: "apply", entry: saved }); }}>{t("stash08")}</Button><Button size="sm" class="h-control-toolbar" variant="outline" disabled={props.disabled || pending() || !props.selected} onClick={() => { const saved = props.history.stashes.find(item => item.id === props.selected); if (saved) open({ kind: "drop", entry: saved }); }}>{t("stash09")}</Button></div></Portal></Show>
    <section class="p-2" aria-label={t("stash01")}>
      <SidebarGroupContent>
        <Show when={props.history.stashes?.length} fallback={<p class="px-2 py-2 text-xs text-muted-foreground">{t("stash03")}</p>}>
          <ul class="space-y-1">
            <For each={props.history.stashes}>{saved => <li class="flex min-w-0 items-center gap-1">
              <Button variant="ghost" class="h-auto min-w-0 flex-1 flex-col items-start gap-1 pl-8 pr-2 py-2 text-left" disabled={props.disabled}
                title={props.onSelect ? saved.message : t("stash23", { name: saved.message })} aria-pressed={props.selected === saved.id} classList={{ "bg-accent": props.selected === saved.id }} onClick={() => props.onSelect ? props.onSelect(saved) : open({ kind: "apply", entry: saved })}>
                <span class="w-full truncate text-xs">{saved.message}</span>
                <span class="w-full truncate text-3xs font-normal text-muted-foreground">{saved.reference} · {new Date(saved.date).toLocaleString(locale())}</span>
              </Button>

            </li>}</For>
          </ul>
        </Show>
      </SidebarGroupContent>
    </section>
    <Dialog open={Boolean(action())} onOpenChange={value => { if (!value && !pending()) setAction(undefined); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title()}</DialogTitle>
          <DialogDescription>{action()?.kind === "save" ? t("stash16") : action()?.kind === "drop" ? t("stash18") : t("stash17")}</DialogDescription>
        </DialogHeader>
        <Show when={entry()}>{saved => <div class="space-y-1"><p class="break-words text-sm font-medium">{saved().message}</p><p class="break-all font-mono text-xs text-muted-foreground">{saved().reference} · {saved().id.slice(0, 8)}</p></div>}</Show>
        <form onSubmit={submit} class="space-y-4">
          <Show when={action()?.kind === "save"}>
            <TextField value={message()} onChange={setMessage} disabled={pending()}>
              <TextFieldLabel>{t("stash04")}</TextFieldLabel>
              <TextFieldInput placeholder={t("stash05")} autocomplete="off" />
            </TextField>
            <label class="flex items-center gap-2 text-sm"><Checkbox checked={includeUntracked()} onChange={setIncludeUntracked} disabled={pending()} />{t("stash06")}</label>
          </Show>
          <Show when={action()?.kind === "apply"}><label class="flex items-center gap-2 text-sm"><Checkbox checked={restoreIndex()} onChange={setRestoreIndex} disabled={pending()} />{t("stash10")}</label></Show>
          <DialogFooter class="gap-2">
            <Button type="button" variant="outline" disabled={pending()} onClick={() => setAction(undefined)}>{t("add09")}</Button>
            <Button type="submit" variant={action()?.kind === "drop" ? "destructive" : "default"} disabled={pending() || props.disabled}>
              {pending() ? action()?.kind === "save" ? t("stash21") : t("stash22") : action()?.kind === "save" ? t("stash07") : action()?.kind === "drop" ? t("stash20") : t("stash19")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
