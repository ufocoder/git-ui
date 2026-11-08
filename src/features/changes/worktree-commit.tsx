import { PanelHeader } from "~/components/ui/panel-header";
import CommitMessageFields from "./commit-message-fields";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { readPanelSizes } from "~/lib/layout-preferences";
import DirectoryDiffView from "~/components/sections/directory-diff-view";
import { filesInDirectory } from "~/lib/file-tree";
import { compareChangedFiles } from "~/lib/file-presentation";
import FileViewControls from "./file-view-controls";
import { readFilePresentation, saveFilePresentation } from "~/lib/file-presentation";
import { createCommitDraft, type CommitDraft } from "~/lib/repository-drafts";
import { t } from "~/lib/i18n";
import { For, Show, untrack, createMemo, createSignal, onCleanup, createEffect } from "solid-js";
import type { CommitFlowState, CommitRequest } from "./commit-flow";
import { git, WORKTREE, type CommitFile, type FileDiff, type History, type WorktreeDiffScope } from "~/lib/git";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import { SelectField } from "~/components/ui/select";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import ChangedFilesTree from "~/components/sections/changed-files-tree";
import FileDiffView from "~/components/sections/file-diff-view";

type WorktreeCommitProps = {
  draft?: CommitDraft;
  history?: History;
  onCommitted?: (history: History) => void;
  onCommitCreated?: () => void;
  onSubmitCommit?: (request: CommitRequest) => Promise<History>;
  commitPhase?: CommitFlowState["kind"];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
};
export default function WorktreeCommit(props: WorktreeCommitProps) {
  const [presentation, setPresentation] = createSignal(readFilePresentation());
  const panelSizes = untrack(() => readPanelSizes(props.history?.path ?? "global", props.onCommitted ? "changes.files" : "history.worktree", [0.5, 0.5]));
  const draft = props.draft ?? createCommitDraft();
  const [sign, setSign] = draft.sign;
  const [amendTarget, setAmendTarget] = draft.amendTarget;
  const [amendConfirmed, setAmendConfirmed] = draft.amendConfirmed;
  const [amendLoading, setAmendLoading] = createSignal(false);
  const [newCommitMessage, setNewCommitMessage] = draft.newCommitMessage;
  let messageRequest = 0;
  const [pushRemote, setPushRemote] = draft.pushRemote;
  const [pushAfterCommit, setPushAfterCommit] = draft.pushAfterCommit;

  const [message, setMessage] = draft.message;
  const [files, setFiles] = createSignal<CommitFile[]>(props.history?.worktree_files ?? []);
  const [loading, setLoading] = createSignal(props.history?.worktree_files === undefined);
  const [pending, setPending] = createSignal(false);
  const [selectedGroup, setSelectedGroup] = createSignal<WorktreeDiffScope>("unstaged");
  const [selectedDirectory, setSelectedDirectory] = createSignal("");
  const [selectedPath, setSelectedPath] = createSignal("");
  const [diff, setDiff] = createSignal<FileDiff>();
  const [diffLoading, setDiffLoading] = createSignal(false);
  const stagedFiles = createMemo(() => files().filter(file => file.staged));
  const unstagedFiles = createMemo(() => files().filter(file => !file.staged || file.partially_staged));
  const directoryFiles = createMemo(() => {
    const group = props.onCommitted ? selectedGroup() === "staged" ? stagedFiles() : unstagedFiles() : files();
    return filesInDirectory(group, selectedDirectory()).sort((a, b) => compareChangedFiles(a, b, presentation().sort) * (presentation().descending ? -1 : 1));
  });
  const stagedCount = createMemo(() => files().filter(file => file.staged).length);
  const disabled = () => props.disabled || pending() || loading() || amendLoading();
  const canAmend = () => Boolean(props.history?.tip && props.history.current_branch && !props.history.operation && !props.history.conflicts.length);
  const amendValid = () => { const target = amendTarget(); return Boolean(target && canAmend() && target.head === props.history?.tip && target.branch === props.history?.current_branch); };
  const canSubmit = () => !disabled() && Boolean(message().trim()) && (amendTarget() ? amendValid() && amendConfirmed() : stagedCount() > 0);
  async function toggleAmend(enabled: boolean) {
    if (disabled()) return;
    const request = ++messageRequest;
    setAmendConfirmed(false);
    if (!enabled) { setAmendTarget(undefined); setMessage(newCommitMessage()); return; }
    if (!canAmend()) return;
    const target = { head: props.history!.tip, branch: props.history!.current_branch };
    setNewCommitMessage(message()); setAmendTarget(target); setAmendLoading(true);
    try {
      const details = await git.getCommitDetails(target.head);
      if (mounted && request === messageRequest) setMessage(details.message);
    } catch { if (mounted && request === messageRequest) { setAmendTarget(undefined); setMessage(newCommitMessage()); } }
    finally { if (mounted && request === messageRequest) setAmendLoading(false); }
  }
  createEffect(() => {
    const project = props.history;
    const remotes = project?.remotes ?? [];
    if (!remotes.some(remote => remote.name === untrack(pushRemote))) setPushRemote(remotes.find(remote => remote.name === "origin")?.name ?? remotes[0]?.name ?? "");
    if (!remotes.length || !project?.current_branch) setPushAfterCommit(false);
  });
  let mounted = true;
  let diffRequest = 0;
  onCleanup(() => {
    mounted = false; diffRequest++; messageRequest++;
    if (amendLoading()) { setAmendTarget(undefined); setAmendConfirmed(false); }
  });
  let loadRequest = 0;
  createEffect(() => {
    const snapshot = props.history?.worktree_files;
    const path = untrack(selectedPath);
    const group = untrack(selectedGroup);
    const directory = untrack(selectedDirectory);
    const request = ++loadRequest;
    const diffVersion = ++diffRequest;
    setLoading(snapshot === undefined);
    void (async () => {
      try {
        const result = snapshot ? { files: snapshot } : await git.getCommitDetails(WORKTREE);
        if (!mounted || request !== loadRequest) return;
        setFiles(result.files);
        if (directory) {
          const candidates = props.onCommitted ? result.files.filter(file => group === "staged" ? file.staged : !file.staged || file.partially_staged) : result.files;
          if (!filesInDirectory(candidates, directory).length) setSelectedDirectory("");
          return;
        }
        const file = result.files.find(file => file.path === path && (!props.onCommitted || (group === "staged" ? file.staged : !file.staged || file.partially_staged)));
        if (!path || !file) { setSelectedPath(""); setDiff(undefined); setDiffLoading(false); return; }
        const next = await git.getFileDiff(WORKTREE, path, props.onCommitted ? group : undefined);
        if (mounted && request === loadRequest && diffVersion === diffRequest) setDiff(next);
      } catch { /* Preserve the current view; the terminal reports failures. */ }
      finally { if (mounted && request === loadRequest) setLoading(false); }
    })();
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
      if (mounted && updated) { setSelectedDirectory(""); setFiles(updated); diffRequest++; setDiff(undefined); setSelectedPath(""); setDiffLoading(false); }
      if (mounted && props.history && props.onCommitted) {
        if (props.history.operation) props.onCommitted(await git.getHistory());
        else if (updated) props.onCommitted({ ...props.history, worktree_files: updated, has_changes: updated.length > 0, conflicts: updated.filter(file => file.status === "U") });
      }
    } catch {
      try { const result = await git.getCommitDetails(WORKTREE); if (mounted) setFiles(result.files); } catch { /* Preserve the last known staging state. */ }
    } finally { setPending(false); props.onBusyChange(false); }
  }
  function openDirectory(path: string, scope?: WorktreeDiffScope) {
    if (disabled()) return;
    diffRequest++; setDiff(undefined); setDiffLoading(false); setSelectedPath("");
    if (scope) setSelectedGroup(scope);
    setSelectedDirectory(path);
  }
  async function openFile(file: CommitFile, scope?: WorktreeDiffScope) {
    if (disabled()) return;
    const request = ++diffRequest;
    setSelectedDirectory("");
    if (scope) setSelectedGroup(scope);
    setSelectedPath(file.path); setDiff(undefined); setDiffLoading(true);
    try { const result = await git.getFileDiff(WORKTREE, file.path, scope); if (request === diffRequest) setDiff(result); }
    catch { /* The Git API reports failures in the terminal. */ }
    finally { if (request === diffRequest) setDiffLoading(false); }
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!props.onCommitted || !props.onSubmitCommit || !canSubmit()) return;
    const target = amendTarget();
    try {
      const history = await props.onSubmitCommit({
        message: message().trim(),
        options: { sign: sign() },
        amend: target ? { ...target, confirmed: amendConfirmed() } : undefined,
        push: pushAfterCommit() ? { remote: pushRemote() } : undefined,
      });
      if (!mounted) return;
      setAmendTarget(undefined); setAmendConfirmed(false); setNewCommitMessage("");
      setSelectedDirectory(""); setMessage(""); setSelectedPath(""); setDiff(undefined); diffRequest++; setDiffLoading(false);
      props.onCommitted(history);
      props.onCommitCreated?.();
    } catch { /* Preserve the message and report failures in the terminal. */ }
  }
  return <div class="flex h-full min-h-0 flex-col"><div class="min-h-0 flex-1"><Resizable layoutId={props.onCommitted ? "changes.files" : "history.worktree"} orientation="horizontal" initialSizes={panelSizes} class="min-h-0 min-w-0">
    <ResizablePanel initialSize={panelSizes[0]} minSize={0.2} class="min-h-0 min-w-0 overflow-auto [scrollbar-gutter:stable]">
      <section class="space-y-3 p-4" aria-label={t("commit04")}>
        <Show when={props.onCommitted}>
          <FileViewControls value={presentation()} onChange={value => { setPresentation(value); saveFilePresentation(value); }} />
          <p class="sr-only" role="status">{t("commit05", { count: stagedCount(), total: files().length })}</p>
        </Show>
        <Show when={loading()}><p role="status" class="sr-only">{t("commit07")}</p></Show>
        <Show when={!loading() && !files().length}><div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground" role="status">{t("commit08")}</div></Show>
        <Show when={props.onCommitted && (loading() || files().length > 0)} fallback={<ChangedFilesTree files={files()} selectedPath={selectedDirectory() || selectedPath()} disabled={disabled()} onSelect={file => void openFile(file)} onSelectDirectory={openDirectory} />}>
          <For each={[
            { kind: "unstaged" as const, label: t("stage02"), files: unstagedFiles, action: t("stage03"), staged: false },
            { kind: "staged" as const, label: t("stage01"), files: stagedFiles, action: t("stage04"), staged: true },
          ]}>{group => <section class="space-y-1" aria-label={group.label}>
            <PanelHeader>
              <h2 class="text-xs font-medium">{group.label} <span class="text-muted-foreground">{group.files().length}</span></h2>
              <Button size="sm" variant="ghost" class="h-7 px-2 text-xs" disabled={disabled() || !group.files().length} onClick={() => void stageFiles(group.files(), !group.staged)}>{group.action}</Button>
            </PanelHeader>
            <Show when={!loading() && !group.files().length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("stage05")}</p></Show>
            <ChangedFilesTree presentation={presentation()} files={group.files()} selectedPath={selectedGroup() === group.kind ? selectedDirectory() || selectedPath() : ""} disabled={disabled()} onSelect={file => void openFile(file, group.kind)} onSelectDirectory={path => openDirectory(path, group.kind)}
              renderDirectoryControl={path => <Checkbox checked={group.staged} disabled={disabled()} onChange={() => void stageFiles(group.files().filter(file => file.path.startsWith(path + "/")), !group.staged)} aria-label={group.staged ? t("stage07", { path }) : t("stage06", { path })} />}
              renderControl={file => <Checkbox checked={group.staged} disabled={disabled()} onChange={() => void stageFile(file, !group.staged)} aria-label={group.staged ? t("stage07", { path: file.path }) : t("stage06", { path: file.path })} />} />
          </section>}</For>
        </Show>
      </section>
    </ResizablePanel>
    <ResizableHandle withHandle aria-label={t("commit12")} />
    <ResizablePanel initialSize={panelSizes[1]} minSize={0.25} class="min-h-0 min-w-0 overflow-hidden">
      <section class="flex h-full min-h-0 flex-col gap-3 p-4" aria-label={t("cf12")}>
        <div class="min-h-0 flex-1">
          <Show when={selectedDirectory()} fallback={<>
          <Show when={diffLoading()}><p role="status" class="text-sm text-muted-foreground">{t("cf13")}</p></Show>
          <Show when={diff()}>{data => <FileDiffView diff={data()} scope={props.onCommitted ? selectedGroup() : undefined} />}</Show>
          <Show when={!selectedPath() && (loading() || files().length > 0)}><p class="text-sm text-muted-foreground">{t("commit17")}</p></Show>
          </>}>
            <DirectoryDiffView path={selectedDirectory()} files={directoryFiles()} commit={WORKTREE} scope={props.onCommitted ? selectedGroup() : undefined} />
          </Show>
        </div>
      </section>
    </ResizablePanel>
  </Resizable></div>
    <Show when={props.onCommitted && !props.history?.operation}>
      <div class="max-h-[50%] shrink-0 panel-surface overflow-y-auto border-t p-4">
          <form onSubmit={submit} class="shrink-0 space-y-3">
            <CommitMessageFields value={message()} onChange={setMessage} disabled={disabled()} />
            <Show when={amendTarget()}>
              <div class="space-y-2 border-l-2 border-warning-foreground pl-3">
                <p class="text-xs text-muted-foreground">{t("commit23", { sha: amendTarget()!.head.slice(0, 8) })}</p>
                <Show when={!amendValid()}><p role="alert" class="text-xs text-destructive">{t("op16")}</p></Show>
                <label class="flex items-start gap-2 text-xs text-muted-foreground"><Checkbox checked={amendConfirmed()} onChange={setAmendConfirmed} disabled={disabled()} />{t("op09")}</label>
              </div>
            </Show>
            <div class="panel-actions -mx-4 -mb-4 flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3">
              <label class="mr-auto flex w-fit shrink-0 cursor-pointer items-center gap-2 text-sm" title={!props.history?.remotes.length ? t("track19") : undefined}>
              <Checkbox checked={pushAfterCommit()} onChange={setPushAfterCommit} disabled={disabled() || !props.history?.remotes.length || !props.history?.current_branch} aria-label={t("commit16")} />
              <span>{t("commit16")}</span>
            </label>
              <DropdownMenu placement="top-start" gutter={4}>
                <DropdownMenuTrigger as={Button} type="button" variant="ghost" size="sm" class="h-control-toolbar gap-2 px-2 text-muted-foreground" disabled={disabled()}>
                  {t("compose07")}<span aria-hidden="true">{sign() || amendTarget() ? "✓" : "⋯"}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem checked={sign()} onChange={setSign} disabled={disabled()} title={t("commit21")}>{t("commit20")}</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={Boolean(amendTarget())} onChange={enabled => void toggleAmend(enabled)} disabled={disabled() || (!amendTarget() && !canAmend())} title={t("compose06")}>{t("commit22")}</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="submit" class="h-control-toolbar px-control-sm-x" disabled={!canSubmit()}>{props.commitPhase === "pushing" ? t("nav06") : props.commitPhase === "committing" ? t("add10") : amendTarget() ? t("op10") : t("stage08", { action: t("commit15"), count: stagedCount() })}</Button>
            </div>
            <Show when={pushAfterCommit() && !props.history?.sync.upstream}>
              <div class="flex items-center justify-end gap-3 text-sm">
                <span>{t("track18")}</span>
                <SelectField class="w-48 max-w-full" aria-label={t("track18")} value={pushRemote()} disabled={disabled()}
                  options={(props.history?.remotes ?? []).map(entry => ({ value: entry.name, label: entry.name }))} onChange={setPushRemote} />
              </div>
            </Show>
          </form>
      </div>
    </Show>
  </div>;
}
