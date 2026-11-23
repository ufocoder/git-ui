import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";
import { git, type Commit, type HistoryRewritePreview, type HistoryRewriteTarget } from "~/lib/git";
import { t } from "~/lib/i18n";

export type HistoryRewriteAction = { head: string; branch: string; commits: Commit[] };

export default function HistoryRewriteDialog(props: {
  action?: HistoryRewriteAction;
  onClose: () => void;
  onExecute: (target: HistoryRewriteTarget, message: string, acceptPublished: boolean) => Promise<void>;
}) {
  const [preview, setPreview] = createSignal<HistoryRewritePreview>();
  const [message, setMessage] = createSignal("");
  const [confirmed, setConfirmed] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const target = (): HistoryRewriteTarget | undefined => {
    const action = props.action;
    return action && { head: action.head, branch: action.branch, commits: action.commits.map(commit => commit.hash) };
  };
  const squash = () => (props.action?.commits.length ?? 0) > 1;
  const title = () => squash() ? t("rewrite.squash") : t("rewrite.reword");
  createEffect(() => {
    const request = target();
    setPreview(undefined); setMessage(""); setConfirmed(false); setError("");
    if (!request) return;
    let active = true;
    onCleanup(() => { active = false; });
    void git.previewHistoryRewrite(request).then(result => {
      if (active) {
        setPreview(result);
        setMessage(result.messages.map(text => text.trimEnd()).filter(Boolean).join("\n\n"));
      }
    }).catch(error => { if (active) setError(String(error)); });
  });

  const canSubmit = () => Boolean(preview() && message().trim() && (squash() || message().trim() !== preview()?.messages[0]?.trim()) && confirmed() && !pending() && !error());
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const request = target();
    if (!request || !canSubmit()) return;
    setPending(true);
    try {
      await props.onExecute({ ...request, accept_extension: Boolean(preview()?.extension && confirmed()) }, message(), Boolean(preview()?.published));
      props.onClose();
    } catch (failure) { setError(String(failure)); }
    finally { setPending(false); }
  }

  return <Dialog open={Boolean(props.action)} onOpenChange={open => { if (!open && !pending()) props.onClose(); }}>
    <Show when={props.action}>{action => <DialogContent class="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title()}</DialogTitle>
        <Show when={preview()}>{details =>
          <DialogDescription>{t("rewrite.affected", { count: details().count })}</DialogDescription>
        }</Show>
      </DialogHeader>
      <Show when={squash()}><details>
        <summary class="text-sm text-muted-foreground">{t("rewrite.selected-list", { count: action().commits.length })}</summary>
        <ul class="mt-2 max-h-32 space-y-1 overflow-auto text-sm">
          <For each={action().commits}>{commit => <li class="grid grid-cols-[8ch_minmax(0,1fr)] items-baseline gap-3">
            <code class="font-mono text-xs text-muted-foreground">{commit.hash.slice(0, 8)}</code>
            <span class="min-w-0 break-words">{commit.subject}</span>
          </li>}</For>
        </ul>
      </details></Show>
      <Show when={!preview() && !error()}><p role="status" class="text-sm text-muted-foreground">{t("common.loading")}</p></Show>
      <Show when={error()}><p role="alert" class="break-words text-sm text-destructive">{error()}</p></Show>
      <Show when={preview()?.extension}><div class="space-y-2 text-sm">
        <p class="text-destructive">{t("rewrite.extension-description", { branch: action().branch, sha: preview()!.extension!.slice(0, 8) })}</p>
        <Show when={preview()?.published}><p class="text-muted-foreground">{t("rewrite.extension-published")}</p></Show>
      </div></Show>
      <form onSubmit={submit} class="space-y-3">
        <Show when={preview()}>{details => <>
          <TextField value={message()} onChange={setMessage} disabled={pending()} required>
            <TextFieldLabel>{squash() ? t("rewrite.combined-message") : t("commit.message")}</TextFieldLabel>
            <TextFieldTextArea class="max-h-56 min-h-24" rows={5} />
          </TextField>
          <label class="flex items-start gap-2 text-sm leading-5"><Checkbox variant={details().published || details().extension ? "destructive" : "default"} class="mt-0.5 shrink-0 space-x-0" checked={confirmed()} onChange={setConfirmed} disabled={pending()} /><span classList={{ "text-destructive": details().published || Boolean(details().extension) }}>{details().extension ? t("rewrite.confirm-extension") : details().published ? t("rewrite.confirm-published") : t("rewrite.confirm")}</span></label>
        </>}</Show>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={pending()} onClick={props.onClose}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!canSubmit()}>{pending() ? t("common.running") : squash() ? t("rewrite.combine") : t("rewrite.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>}</Show>
  </Dialog>;
}
