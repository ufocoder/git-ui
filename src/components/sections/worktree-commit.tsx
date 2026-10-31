import { t } from "~/lib/i18n";
import { For, Show, untrack, createMemo, createSignal, onCleanup, createEffect } from "solid-js";
import { git, WORKTREE, type CommitFile, type FileDiff, type History } from "~/lib/git";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import { NativeSelect } from "~/components/ui/native-select";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";
import { reportTerminalError } from "~/lib/terminal";
import ChangedFilesTree from "./changed-files-tree";
import FileDiffView from "./file-diff-view";

type WorktreeCommitProps = {
  active?: boolean;
  history?: History;
  onCommitted?: (history: History) => void;
  onCommitCreated?: () => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
};
export default function WorktreeCommit(props: WorktreeCommitProps) {
  const [pushRemote, setPushRemote] = createSignal("");
  const [pushAfterCommit, setPushAfterCommit] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);
  const [pushing, setPushing] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [files, setFiles] = createSignal<CommitFile[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [pending, setPending] = createSignal(false);
  const [selectedPath, setSelectedPath] = createSignal("");
  const [diff, setDiff] = createSignal<FileDiff>();
  const [diffLoading, setDiffLoading] = createSignal(false);
  const stagedCount = createMemo(() => files().filter(file => file.staged).length);
  const disabled = () => props.disabled || pending() || loading();
  createEffect(() => {
    const project = props.history;
    const remotes = project?.remotes ?? [];
    if (!remotes.some(remote => remote.name === untrack(pushRemote))) setPushRemote(remotes.find(remote => remote.name === "origin")?.name ?? remotes[0]?.name ?? "");
    if (!remotes.length || !project?.current_branch) setPushAfterCommit(false);
  });
  let mounted = true;
  let diffRequest = 0;
  onCleanup(() => { mounted = false; diffRequest++; });
  let loadRequest = 0;
  createEffect(() => {
    if (props.active === false) return;
    void props.history;
    diffRequest++; setSelectedPath(""); setDiff(undefined); setDiffLoading(false);
    const request = ++loadRequest;
    setLoading(true);
    void git.getCommitDetails(WORKTREE)
      .then(result => { if (mounted && request === loadRequest) setFiles(result.files); })
      .catch(() => { /* The Git API reports failures in the terminal. */ })
      .finally(() => { if (mounted && request === loadRequest) setLoading(false); });
  });
  async function stageFile(file: CommitFile, staged: boolean) {
    await stageFiles([file], staged);
  }
  async function stageFiles(selected: CommitFile[], staged: boolean) {
    if (!props.onCommitted || disabled()) return;
    setPending(true); props.onBusyChange(true);
    try {
      let updated: CommitFile[] | undefined;
      for (const file of selected) {
        if (staged ? file.staged && !file.partially_staged : !file.staged) continue;
        updated = (await git.setFileStaged(file.path, staged)).files;
      }
      if (mounted && updated) setFiles(updated);
      if (mounted && props.history?.operation && props.onCommitted) props.onCommitted(await git.getHistory());
    } catch {
      try { const result = await git.getCommitDetails(WORKTREE); if (mounted) setFiles(result.files); } catch { /* Preserve the last known staging state. */ }
    } finally { setPending(false); props.onBusyChange(false); }
  }
  async function openFile(file: CommitFile) {
    if (disabled()) return;
    const request = ++diffRequest;
    setSelectedPath(file.path); setDiff(undefined); setDiffLoading(true);
    try { const result = await git.getFileDiff(WORKTREE, file.path); if (request === diffRequest) setDiff(result); }
    catch { /* The Git API reports failures in the terminal. */ }
    finally { if (request === diffRequest) setDiffLoading(false); }
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!props.onCommitted || disabled() || !message().trim() || !stagedCount()) return;
    const shouldPush = pushAfterCommit();
    const remote = pushRemote();
    setCommitting(true); setPending(true); props.onBusyChange(true);
    try {
      const history = await git.commitChanges(message().trim());
      if (!mounted) return;
      setMessage(""); setSelectedPath(""); setDiff(undefined); diffRequest++; setDiffLoading(false);
      props.onCommitted(history);
      props.onCommitCreated?.();
      try { const details = await git.getCommitDetails(WORKTREE); if (mounted) setFiles(details.files); }
      catch (error) { reportTerminalError(t("commit01", { p1: String(error) }), t("commit02")); }
      if (shouldPush) {
        setPushing(true);
        try {
          const synced = history.sync.upstream ? await git.sync("push") : await git.publishBranch(history.current_branch, remote, history.current_branch);
          if (mounted) props.onCommitted(synced);
        } catch (error) {
          reportTerminalError(t("commit03", { p1: String(error) }), t("cmd10"));
        } finally { setPushing(false); }
      }
    } catch { /* Preserve the message and report failures in the terminal. */ }
    finally { setCommitting(false); setPending(false); props.onBusyChange(false); }
  }
  return <div class="flex h-full min-h-0 flex-col"><div class="min-h-0 flex-1"><Resizable orientation="horizontal" initialSizes={[0.28, 0.72]} class="min-h-0 min-w-0">
    <ResizablePanel minSize={0.2} class="min-h-0 min-w-0 overflow-auto">
      <section class="space-y-3 p-4" aria-label={t("commit04")}>
        <Show when={props.onCommitted}>
          <p class="text-xs text-muted-foreground">{t("commit05", { count: stagedCount(), total: files().length })}</p>
        </Show>
        <Show when={loading()}><p role="status" class="text-sm text-muted-foreground">{t("commit07")}</p></Show>
        <Show when={!loading() && !files().length}><p class="text-sm text-muted-foreground">{t("commit08")}</p></Show>
        <ChangedFilesTree files={files()} selectedPath={selectedPath()} disabled={disabled()} onSelect={file => void openFile(file)}
          renderDirectoryControl={props.onCommitted ? (path, descendants) => <Checkbox
            checked={descendants.length > 0 && descendants.every(file => file.staged && !file.partially_staged)}
            indeterminate={descendants.some(file => file.staged) && !descendants.every(file => file.staged && !file.partially_staged)}
            disabled={disabled()} onChange={checked => void stageFiles(descendants, checked)}
            aria-label={t("commit09", { p1: path })} /> : undefined}
          renderControl={props.onCommitted ? file => <Checkbox checked={file.staged && !file.partially_staged} indeterminate={file.partially_staged} disabled={disabled()}
            onChange={checked => void stageFile(file, checked)} aria-label={t("commit10", { p1: file.path })}
            title={file.partially_staged ? t("commit11") : t("commit10", { p1: file.path })} /> : undefined} />
      </section>
    </ResizablePanel>
    <ResizableHandle withHandle aria-label={t("commit12")} />
    <ResizablePanel minSize={0.25} class="min-h-0 min-w-0 overflow-hidden">
      <section class="flex h-full min-h-0 flex-col gap-3 p-4" aria-label={t("cf12")}>
        <div class="min-h-0 flex-1">
          <Show when={diffLoading()}><p role="status" class="text-sm text-muted-foreground">{t("cf13")}</p></Show>
          <Show when={diff()}>{data => <FileDiffView diff={data()} />}</Show>
          <Show when={!selectedPath()}><p class="text-sm text-muted-foreground">{t("commit17")}</p></Show>
        </div>
      </section>
    </ResizablePanel>
  </Resizable></div>
    <div class="shrink-0 border-t bg-muted/20 p-4">
        <Show when={props.onCommitted}>
          <form onSubmit={submit} class="shrink-0 space-y-3">
            <TextField value={message()} onChange={setMessage} disabled={disabled()} required>
              <TextFieldLabel>{t("commit13")}</TextFieldLabel>
              <TextFieldTextArea placeholder={t("commit14")} class="max-h-28 min-h-16" rows={2} />
            </TextField>
            <div class="flex items-center justify-between gap-4">
              <Button type="submit" class="order-last ml-auto" disabled={disabled() || !message().trim() || !stagedCount()}>{pushing() ? t("nav06") : committing() ? t("add10") : t("commit15")}</Button>
              <label class="flex w-fit shrink-0 cursor-pointer items-center gap-2 text-sm" title={!props.history?.remotes.length ? t("track19") : undefined}>
              <Checkbox checked={pushAfterCommit()} onChange={setPushAfterCommit} disabled={disabled() || !props.history?.remotes.length || !props.history?.current_branch} aria-label={t("commit16")} />
              <span>{t("commit16")}</span>
            </label>
            </div>
            <Show when={pushAfterCommit() && !props.history?.sync.upstream}>
              <label class="flex items-center justify-end gap-3 text-sm">
                <span>{t("track18")}</span>
                <NativeSelect class="max-w-48" value={pushRemote()} disabled={disabled()} onChange={event => setPushRemote(event.currentTarget.value)}>
                  <For each={props.history?.remotes}>{entry => <option value={entry.name}>{entry.name}</option>}</For>
                </NativeSelect>
              </label>
            </Show>
          </form>
        </Show>
    </div>
  </div>;
}
