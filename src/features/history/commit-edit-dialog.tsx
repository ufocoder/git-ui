import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { t } from "~/lib/i18n";
import { git, type Commit, type CommitOperation } from "~/lib/git";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { SelectField } from "~/components/ui/select";

export type CommitEditAction = { kind: "cherry_pick" | "revert" | "amend"; commit: Commit; head: string; branch: string };
export default function CommitEditDialog(props: {
  action: CommitEditAction | undefined;
  onClose: () => void;
  onExecute: (head: string, branch: string, operation: CommitOperation) => Promise<void>;
}) {
  const [message, setMessage] = createSignal("");
  const [mainline, setMainline] = createSignal(1);
  const [confirmed, setConfirmed] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  let generation = 0;
  createEffect(() => {
    const action = props.action;
    const request = ++generation;
    setMessage(""); setMainline(1); setConfirmed(false); setLoading(false);
    if (action?.kind === "amend") {
      setLoading(true);
      void git.getCommitDetails(action.commit.hash)
        .then(details => { if (request === generation) setMessage(details.message); })
        .catch(() => { if (request === generation) props.onClose(); })
        .finally(() => { if (request === generation) setLoading(false); });
    }
  });
  onCleanup(() => { generation++; });
  const title = () => props.action?.kind === "amend" ? t("operation.amend") : props.action?.kind === "revert" ? t("operation.revert") : t("operation.cherry-pick");
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const action = props.action;
    if (!action || pending() || loading() || (action.kind === "amend" && (!confirmed() || !message().trim()))) return;
    setPending(true);
    const operation: CommitOperation = action.kind === "amend" ? { kind: "amend", commit: action.commit.hash, message: message().trim(), confirmed: confirmed() }
      : { kind: action.kind, commit: action.commit.hash, mainline: action.commit.parents.length > 1 ? mainline() : undefined };
    try { await props.onExecute(action.head, action.branch, operation); props.onClose(); }
    catch { props.onClose(); /* Errors are shown in the terminal. */ }
    finally { setPending(false); }
  }
  return <Dialog open={Boolean(props.action)} onOpenChange={value => { if (!value && !pending()) props.onClose(); }}>
    <Show when={props.action}>{action => <DialogContent>
      <DialogHeader>
        <DialogTitle>{title()}</DialogTitle>
        <DialogDescription>{action().kind === "amend" ? t("operation.amend-description") : action().kind === "revert" ? t("operation.revert-description", { branch: action().branch }) : t("operation.cherry-pick-description", { branch: action().branch })}</DialogDescription>
      </DialogHeader>
      <p class="break-words text-sm"><code>{action().commit.hash.slice(0, 8)}</code> · {action().commit.subject}</p>
      <form onSubmit={submit} class="space-y-4">
        <Show when={action().kind === "amend"} fallback={
          <Show when={action().commit.parents.length > 1}>
            <SelectField label={t("operation.mainline")} value={String(mainline())} disabled={pending()} onChange={value => setMainline(Number(value))}
              options={action().commit.parents.map((hash, index) => ({ value: String(index + 1), label: `${index + 1} · ${hash.slice(0, 8)}` }))} />
            <p class="text-xs text-muted-foreground">{t("operation.parent-description")}</p>
          </Show>
        }>
          <TextField value={message()} onChange={setMessage} disabled={pending() || loading()} required>
            <TextFieldLabel>{t("commit.message")}</TextFieldLabel>
            <TextFieldTextArea class="max-h-56 min-h-28" rows={5} />
          </TextField>
          <label class="flex items-start gap-2 text-sm"><Checkbox checked={confirmed()} onChange={setConfirmed} disabled={pending() || loading()} />{t("operation.confirm-amend")}</label>
        </Show>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={pending()} onClick={props.onClose}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={pending() || loading() || (action().kind === "amend" && (!confirmed() || !message().trim()))}>{pending() ? t("common.running") : action().kind === "amend" ? t("operation.amend-commit") : title()}</Button>
        </DialogFooter>
      </form>
    </DialogContent>}</Show>
  </Dialog>;
}
