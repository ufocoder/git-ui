import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import { git, WORKTREE, type CommitFile, type DiscardPreview, type DiscardResult, type History } from "~/lib/git";
import { t } from "~/lib/i18n";
import { virtualRange } from "~/lib/virtual-range";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { FileStatus } from "~/components/ui/file-status";

export default function DiscardChangesDialog(props: {
  path: string | undefined;
  history: History;
  busy: boolean;
  onClose: () => void;
  onHistoryChange: (history: History) => void;
  onBusyChange: (busy: boolean) => void;
  onOpenStash: () => void;
}) {
  const [files, setFiles] = createSignal<CommitFile[]>([]);
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = createSignal<DiscardPreview>();
  const [result, setResult] = createSignal<DiscardResult>();
  const [confirmed, setConfirmed] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [top, setTop] = createSignal(0);
  let generation = 0, opening = 0, mounted = true;
  onCleanup(() => { mounted = false; generation++; opening++; });
  createEffect(on(() => props.path, path => {
    const request = ++opening; generation++;
    setFiles([]); setSelected(new Set<string>()); setPreview(undefined); setResult(undefined); setConfirmed(false); setError(""); setTop(0);
    if (path === undefined) return;
    const load = (entries: CommitFile[]) => {
      if (!mounted || request !== opening) return;
      setFiles(entries);
      setSelected(new Set(entries.filter(file => !path || file.path === path || file.path.startsWith(path + "/")).map(file => file.path)));
    };
    if (props.history.worktree_files) load(props.history.worktree_files);
    else void git.getCommitDetails(WORKTREE).then(details => load(details.files)).catch(failure => { if (mounted && request === opening) setError(String(failure)); });
  }));
  const chosen = createMemo(() => files().filter(file => selected().has(file.path)).map(file => file.path));
  createEffect(() => {
    const paths = chosen(), open = props.path !== undefined, completed = Boolean(result());
    const request = ++generation;
    setPreview(undefined); setConfirmed(false); setChecking(false);
    if (!open || !paths.length || completed) return;
    setChecking(true); setError("");
    const timer = setTimeout(() => {
      void git.previewDiscardChanges(paths).then(value => { if (mounted && request === generation) setPreview(value); })
        .catch(failure => { if (mounted && request === generation) setError(String(failure)); })
        .finally(() => { if (mounted && request === generation) setChecking(false); });
    }, 150);
    onCleanup(() => clearTimeout(timer));
  });
  const blocked = () => !props.history.tip || props.history.git_lfs_missing || Boolean(props.history.operation) || props.history.conflicts.length > 0;
  const stale = () => Boolean(preview() && (preview()!.target.head !== props.history.tip || preview()!.target.branch !== props.history.current_branch));
  const range = createMemo(() => virtualRange(files().length, top(), 176, 44, 4));
  function toggle(path: string, checked: boolean) {
    const next = new Set(selected()); if (checked) next.add(path); else next.delete(path); setSelected(next);
  }
  async function submit() {
    const target = preview()?.target;
    if (!target || !confirmed() || pending() || props.busy || checking() || blocked() || stale()) return;
    setPending(true); props.onBusyChange(true); setError("");
    try {
      const response = await git.discardWorktreeChanges(target);
      if (mounted) { setResult(response); props.onHistoryChange(response.history); }
    } catch (failure) { if (mounted) { setError(String(failure)); setPreview(undefined); setConfirmed(false); } }
    finally { if (mounted) setPending(false); props.onBusyChange(false); }
  }
  return <Dialog open={props.path !== undefined} onOpenChange={open => { if (!open && !pending()) props.onClose(); }}>
    <Show when={props.path !== undefined}><DialogContent>
      <DialogHeader class="pr-6 text-left">
        <DialogTitle>{result() ? t("discard.done") : t("discard.title")}</DialogTitle>
        <DialogDescription>{result() ? t("discard.saved-copy") : t("discard.description")}</DialogDescription>
      </DialogHeader>
      <Show when={!result()} fallback={<p class="text-sm">{t("discard.completed-count", { count: result()!.count })}</p>}>
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm"><Checkbox class="space-x-0" checked={files().length > 0 && chosen().length === files().length} indeterminate={chosen().length > 0 && chosen().length < files().length} disabled={pending() || props.busy || !files().length} onChange={checked => setSelected(new Set(checked ? files().map(file => file.path) : []))} /><span>{t("discard.selected", { count: chosen().length, total: files().length })}</span></label>
          <div class="h-44 overflow-auto" role="group" aria-label={t("discard.file-list")} onScroll={event => setTop(event.currentTarget.scrollTop)}>
            <div class="relative" style={{ height: `${files().length * 44}px` }}><div class="absolute inset-x-0" style={{ top: `${range().start * 44}px` }}>
              <For each={files().slice(range().start, range().end)}>{file => <label class="flex h-11 min-w-0 items-center gap-2 text-sm" title={file.path}>
                <Checkbox class="shrink-0 space-x-0" checked={selected().has(file.path)} disabled={pending() || props.busy} onChange={checked => toggle(file.path, checked)} aria-label={file.path} />
                <FileStatus status={file.status} /><span class="min-w-0 flex-1 truncate">{file.path}</span>
                <Show when={file.staged}><span class="shrink-0 text-xs text-muted-foreground">{t("stage.staged")}</span></Show>
              </label>}</For>
            </div></div>
          </div>
        </div>
        <p class="text-sm text-muted-foreground">{t("discard.backup-note")}</p>
        <Show when={checking()}><p role="status" class="text-xs text-muted-foreground">{t("discard.checking")}</p></Show>
        <Show when={blocked()}><p role="alert" class="text-sm text-destructive">{t("file-action.operation-in-progress")}</p></Show>
        <Show when={stale()}><p role="alert" class="text-sm text-destructive">{t("discard.stale")}</p></Show>
        <label class="flex items-start gap-2 text-sm leading-5 text-destructive"><Checkbox variant="destructive" class="mt-0.5 shrink-0 space-x-0" checked={confirmed()} onChange={setConfirmed} disabled={pending() || props.busy || !preview() || checking()} /><span>{t("discard.confirm")}</span></label>
      </Show>
      <Show when={error()}><p role="alert" class="break-words text-sm text-destructive">{error()}</p></Show>
      <DialogFooter class="gap-2">
        <Button variant="outline" disabled={pending()} onClick={props.onClose}>{result() ? t("dialog.close") : t("common.cancel")}</Button>
        <Show when={result()} fallback={<Button variant="destructive" disabled={pending() || props.busy || checking() || !preview() || !confirmed() || stale() || blocked()} onClick={() => void submit()}>{pending() ? t("common.running") : t("discard.action")}</Button>}>
          <Button onClick={() => { props.onClose(); props.onOpenStash(); }}>{t("discard.open-stash")}</Button>
        </Show>
      </DialogFooter>
    </DialogContent></Show>
  </Dialog>;
}
