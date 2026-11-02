import { t } from "~/lib/i18n";
import { Show, createEffect, createSignal, on } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldLabel, TextFieldInput } from "~/components/ui/text-field";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import type { Commit, ResetMode } from "~/lib/git";

export type CommitDialogAction = { kind: "reset" | "tag" | "branch"; commit: Commit };
type Props = {
  action: CommitDialogAction | undefined;
  branch: string;
  head: string;
  hasChanges: boolean;
  disabled: boolean;
  onClose: () => void;
  onReset: (commit: string, mode: ResetMode, discardConfirmed: boolean, head: string, branch: string) => Promise<void>;
  onBranch: (name: string, commit: string) => Promise<void>;
  onTag: (name: string, commit: string) => Promise<void>;
};
export default function CommitActionsDialog(props: Props) {
  const [name, setName] = createSignal("");
  const [mode, setMode] = createSignal<ResetMode>("mixed");
  const [confirmed, setConfirmed] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [target, setTarget] = createSignal({ branch: "", head: "" });
  createEffect(on(() => props.action, action => {
    if (action) { setName(""); setMode("mixed"); setConfirmed(false); setTarget({ branch: props.branch, head: props.head }); }
  }));
  const stale = () => props.action?.kind === "reset" && (target().branch !== props.branch || target().head !== props.head);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const action = props.action;
    if (!action || pending() || props.disabled || stale()) return;
    if (action.kind !== "reset" && !name().trim()) return;
    if (action.kind === "reset" && mode() === "hard" && !confirmed()) return;
    setPending(true);
    try {
      if (action.kind === "tag") await props.onTag(name().trim(), action.commit.hash);
      else if (action.kind === "branch") await props.onBranch(name().trim(), action.commit.hash);
      else await props.onReset(action.commit.hash, mode(), confirmed(), target().head, target().branch);
      props.onClose();
    } catch { props.onClose(); }
    finally { setPending(false); }
  }
  return <Dialog open={Boolean(props.action)} onOpenChange={open => { if (!open && !pending()) props.onClose(); }}>
    <Show when={props.action}>{action => <DialogContent>
      <DialogHeader>
        <DialogTitle>{action().kind === "branch" ? t("act01") : action().kind === "tag" ? t("act02") : t("act03")}</DialogTitle>
        <DialogDescription>{action().kind === "branch" ? t("act04") : action().kind === "tag" ? t("act05") : t("act06", { p1: target().branch })}</DialogDescription>
      </DialogHeader>
      <p class="break-words text-sm"><code>{action().commit.hash.slice(0, 8)}</code> · {action().commit.subject}</p>
      <Show when={action().kind === "reset"}>
        <div class="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <p class="break-all font-medium">{t("safe01", { branch: target().branch, from: target().head.slice(0, 8), to: action().commit.hash.slice(0, 8) })}</p>
          <p class="text-muted-foreground">{t("safe02")}</p>
          <p class="text-muted-foreground">{props.hasChanges ? t("safe03") : t("safe04")}</p>
        </div>
        <Show when={stale()}><p role="alert" class="text-sm text-destructive">{t("safe05")}</p></Show>
      </Show>
      <form onSubmit={submit} class="space-y-4">
        <Show when={action().kind !== "reset"} fallback={<>
          <ToggleGroup value={mode()} onChange={value => { if (value === "soft" || value === "mixed" || value === "hard") { setMode(value); setConfirmed(false); } }} disabled={pending()} aria-label={t("act07")}>
            <ToggleGroupItem value="soft">{t("act08")}</ToggleGroupItem><ToggleGroupItem value="mixed">{t("act09")}</ToggleGroupItem><ToggleGroupItem value="hard">{t("act10")}</ToggleGroupItem>
          </ToggleGroup>
          <p class="text-sm text-muted-foreground">{mode() === "soft" ? t("act11") : mode() === "mixed" ? t("act12") : t("act13")}</p>
          <Show when={mode() === "hard"}>
            <label class="flex items-start gap-2 text-sm"><Checkbox checked={confirmed()} onChange={setConfirmed} disabled={pending()} />{t("act14", { branch: target().branch, sha: action().commit.hash.slice(0, 8) })}</label>
          </Show>
        </>}>
          <TextField value={name()} onChange={setName} disabled={pending()} required><TextFieldLabel>{action().kind === "branch" ? t("act15") : t("add05")}</TextFieldLabel><TextFieldInput placeholder={action().kind === "branch" ? t("branchEx") : t("tagEx")} autocomplete="off" spellcheck={false} /></TextField>
        </Show>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={pending()} onClick={props.onClose}>{t("add09")}</Button>
          <Button type="submit" variant={action().kind === "reset" && mode() === "hard" ? "destructive" : "default"} disabled={pending() || props.disabled || stale() || (action().kind !== "reset" ? !name().trim() : mode() === "hard" && !confirmed())}>{pending() ? t("act16") : action().kind === "branch" ? t("act17") : action().kind === "tag" ? t("add01") : t("act18")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>}</Show>
  </Dialog>;
}
