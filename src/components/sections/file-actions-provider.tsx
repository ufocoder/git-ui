import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { isTauri } from "@tauri-apps/api/core";
import { FileActionsContext, absoluteProjectPath } from "~/lib/file-actions-context";
import { git, WORKTREE, type History, type RestorePreview } from "~/lib/git";
import { startOperation, finishOperation } from "~/lib/operation-feedback";
import { reportTerminalError } from "~/lib/terminal";
import { t } from "~/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldLabel, TextFieldInput } from "~/components/ui/text-field";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";

export default function FileActionsProvider(props: { history: History; disabled: boolean; onHistory: (path: string) => void; onHistoryChange: (history: History) => void; onBusyChange: (busy: boolean) => void; children: JSX.Element }) {
  const [platform, setPlatform] = createSignal("");
  const [path, setPath] = createSignal("");
  const [commit, setCommit] = createSignal("");
  const [preview, setPreview] = createSignal<RestorePreview>();
  const [confirmed, setConfirmed] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  let mounted = true;
  onCleanup(() => { mounted = false; });
  onMount(() => { if (isTauri()) void git.fileActionsPlatform().then(value => { if (mounted) setPlatform(value); }).catch(() => {}); });
  const stale = () => Boolean(preview() && (preview()!.head !== props.history.tip || preview()!.branch !== props.history.current_branch));
  const canRestore = () => Boolean(props.history.tip && !props.history.operation && !props.history.conflicts.length);
  async function prepare() {
    if (pending() || props.disabled) return;
    setPending(true); setError(""); setPreview(undefined); setConfirmed(false);
    try { const result = await git.previewRestorePath(path(), commit().trim()); if (mounted) setPreview(result); }
    catch (failure) { if (mounted) setError(String(failure)); }
    finally { if (mounted) setPending(false); }
  }
  async function restore() {
    const target = preview();
    if (!target || !confirmed() || pending() || props.disabled || stale() || !canRestore()) return;
    setPending(true); props.onBusyChange(true); setError("");
    try {
      const history = await git.restorePath(path(), target, true);
      if (mounted) { props.onHistoryChange(history); setPath(""); }
    } catch (failure) { if (mounted) setError(String(failure)); }
    finally { if (mounted) setPending(false); props.onBusyChange(false); }
  }
  return <FileActionsContext.Provider value={{
    disabled: () => props.disabled,
    canRestore,
    managerLabel: () => platform() === "macos" ? t("fileAct05") : platform() === "windows" ? t("fileAct06") : t("fileAct04"),
    history: props.onHistory,
    copy: path => {
      const operation = startOperation(t("fileAct02"));
      void navigator.clipboard.writeText(absoluteProjectPath(props.history.path, path))
        .then(() => finishOperation(operation, t("fileAct02")))
        .catch(failure => reportTerminalError(failure, t("fileAct02")));
    },
    reveal: path => { void git.revealPath(path).catch(() => {}); },
    restore: (path, source) => { setPath(path); setCommit(source && source !== WORKTREE ? source : props.history.tip); setPreview(undefined); setConfirmed(false); setError(""); },
  }}>
    {props.children}
    <Dialog open={Boolean(path())} onOpenChange={open => { if (!open && !pending()) setPath(""); }}>
      <Show when={path()}><DialogContent>
        <DialogHeader><DialogTitle>{t("fileAct03")}</DialogTitle><DialogDescription>{t("fileAct07")}</DialogDescription></DialogHeader>
        <p class="break-all text-sm font-medium">{path()}</p>
        <TextField value={commit()} disabled={pending()} onChange={value => { setCommit(value); setPreview(undefined); setConfirmed(false); }}>
          <TextFieldLabel>{t("fileAct08")}</TextFieldLabel>
          <TextFieldInput autocomplete="off" spellcheck={false} />
        </TextField>
        <Show when={preview()}>{target => <div class="space-y-3">
          <p class="break-all text-sm"><code>{target().commit.slice(0, 12)}</code> · {target().subject}</p>
          <p class="text-sm text-muted-foreground">{t("fileAct09")}</p>
          <label class="flex items-start gap-2 text-sm"><Checkbox checked={confirmed()} onChange={setConfirmed} disabled={pending()} />{t("fileAct10")}</label>
        </div>}</Show>
        <Show when={!canRestore()}><p role="alert" class="text-sm text-destructive">{t("fileAct14")}</p></Show>
        <Show when={stale()}><p role="alert" class="text-sm text-destructive">{t("safe05")}</p></Show>
        <Show when={error()}><p role="alert" class="break-all text-sm text-destructive">{error()}</p></Show>
        <DialogFooter class="gap-2">
          <Button variant="outline" disabled={pending()} onClick={() => setPath("")}>{t("add09")}</Button>
          <Show when={preview()} fallback={<Button disabled={pending() || props.disabled || !commit().trim()} onClick={() => void prepare()}>{pending() ? t("ui01") : t("fileAct11")}</Button>}>
            <Button variant="destructive" disabled={pending() || props.disabled || !confirmed() || stale() || !canRestore()} onClick={() => void restore()}>{pending() ? t("act16") : t("fileAct15")}</Button>
          </Show>
        </DialogFooter>
      </DialogContent></Show>
    </Dialog>
  </FileActionsContext.Provider>;
}
