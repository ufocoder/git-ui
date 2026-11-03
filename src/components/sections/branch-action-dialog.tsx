import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import { git, type BranchActionPreview, type BranchRemoteTarget } from "~/lib/git";
import { t } from "~/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { SelectField } from "~/components/ui/select";
export type BranchAction = { name: string; kind: "delete" | "rebase" };
export default function BranchActionDialog(props: { action?: BranchAction; busy: boolean; onClose: () => void; onExecute: (action: BranchAction, preview: BranchActionPreview, remote: BranchRemoteTarget | null) => Promise<void> }) {
  const [preview, setPreview] = createSignal<BranchActionPreview>();
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [removeRemote, setRemoveRemote] = createSignal(false);
  const [remote, setRemote] = createSignal("");
  let generation = 0;
  onCleanup(() => { generation++; });
  createEffect(on(() => props.action, async action => {
    const request = ++generation;
    setPreview(undefined); setError(""); setRemoveRemote(false); setLoading(Boolean(action));
    if (!action) return;
    try {
      const value = await git.previewBranchAction(action.name, action.kind === "delete");
      if (request !== generation) return;
      setPreview(value); setRemote(value.remotes.find(item => item.tip)?.remote ?? "");
    } catch (reason) { if (request === generation) setError(String(reason)); }
    finally { if (request === generation) setLoading(false); }
  }));
  const remotes = createMemo(() => preview()?.remotes.filter(item => item.tip) ?? []);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const action = props.action, value = preview();
    if (!action || !value || props.busy || pending()) return;
    setPending(true); setError("");
    try { await props.onExecute(action, value, removeRemote() ? remotes().find(item => item.remote === remote()) ?? null : null); props.onClose(); }
    catch (reason) { setError(String(reason)); }
    finally { setPending(false); }
  }
  return <Dialog open={Boolean(props.action)} onOpenChange={open => { if (!open && !pending() && !props.busy) props.onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>{props.action?.kind === "delete" ? t("refAct03") : t("branchAct01")}</DialogTitle>
      <DialogDescription>{props.action?.kind === "delete" ? t("refAct06", { name: props.action.name }) : t("branchAct02", { current: preview()?.branch ?? "…", target: props.action?.name ?? "" })}</DialogDescription></DialogHeader>
      <form class="space-y-4" onSubmit={submit}>
        <Show when={loading()}><p role="status" class="text-sm text-muted-foreground">{t("branchAct03")}</p></Show>
        <Show when={preview() && props.action?.kind === "delete"}>
          <Show when={remotes().length} fallback={<p class="text-sm text-muted-foreground">{t("branchAct05")}</p>}>
            <label class="flex items-center gap-2 text-sm"><Checkbox checked={removeRemote()} onChange={setRemoveRemote} disabled={pending() || props.busy} />{t("branchAct04")}</label>
            <Show when={removeRemote()}><SelectField options={remotes().map(item => ({ value: item.remote, label: `${item.remote}/${item.reference.replace(/^refs\/heads\//, "")}` }))} value={remote()} onChange={setRemote} disabled={pending() || props.busy} aria-label={t("branchAct04")} /></Show>
          </Show>
          <Show when={preview()?.remotes.some(item => item.error)}><p class="text-sm text-muted-foreground">{t("branchAct06")}</p></Show>
        </Show>
        <Show when={props.action?.kind === "rebase"}><p class="text-sm text-muted-foreground">{t("branchAct07")}</p></Show>
        <Show when={error()}><p role="alert" class="break-words text-sm text-destructive">{error()}</p></Show>
        <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={pending() || props.busy} onClick={props.onClose}>{t("add09")}</Button><Button type="submit" variant={props.action?.kind === "delete" ? "destructive" : "default"} disabled={!preview() || loading() || pending() || props.busy}>{pending() ? t("add10") : props.action?.kind === "delete" ? t("refAct03") : t("branchAct01")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
