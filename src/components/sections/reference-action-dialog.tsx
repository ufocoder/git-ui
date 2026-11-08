import { createEffect, createSignal, on, Show } from "solid-js";
import { t } from "~/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { Button } from "~/components/ui/button";

export type ReferenceAction = { kind: "branch" | "tag"; name: string; deleting?: boolean };
export default function ReferenceActionDialog(props: { action: ReferenceAction | undefined; busy: boolean; onClose: () => void; onExecute: (action: ReferenceAction, name: string | null) => Promise<void> }) {
  const [name, setName] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  createEffect(on(() => props.action, action => { setName(action?.name ?? ""); setError(""); }));
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const action = props.action;
    if (!action || pending() || props.busy || (!action.deleting && (!name().trim() || name().trim() === action.name))) return;
    setPending(true); setError("");
    try { await props.onExecute(action, action.deleting ? null : name().trim()); props.onClose(); }
    catch (reason) { setError(String(reason)); }
    finally { setPending(false); }
  }
  return <Dialog open={Boolean(props.action)} onOpenChange={open => { if (!open && !pending() && !props.busy) props.onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>{props.action?.deleting ? t("ref-action.delete-branch") : t("ref-action.rename")}</DialogTitle><DialogDescription>{props.action?.deleting ? t("ref-action.delete-description", { name: props.action.name }) : t("ref-action.rename-description", { name: props.action?.name ?? "" })}</DialogDescription></DialogHeader>
      <form onSubmit={submit} class="space-y-4">
        <Show when={!props.action?.deleting}><TextField value={name()} onChange={setName} disabled={pending() || props.busy} required><TextFieldLabel>{t("ref-action.new-name")}</TextFieldLabel><TextFieldInput autocomplete="off" spellcheck={false} /></TextField></Show>
        <Show when={error()}><p role="alert" class="break-words text-sm text-destructive">{error()}</p></Show>
        <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={pending() || props.busy} onClick={props.onClose}>{t("common.cancel")}</Button><Button type="submit" variant={props.action?.deleting ? "destructive" : "default"} disabled={pending() || props.busy || (!props.action?.deleting && (!name().trim() || name().trim() === props.action?.name))}>{pending() ? t("common.saving") : props.action?.deleting ? t("ref-action.delete-branch") : t("ref-action.rename")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
