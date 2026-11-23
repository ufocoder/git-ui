import { diffLoader } from "~/lib/diff-loader";
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { hasDiffScope, selectDiffScope, stageSelectedFiles } from "./staging-selection";
import { indexFileSelection } from "~/lib/file-selection-index";
import { compareChangedFiles, type FilePresentation } from "~/lib/file-presentation";
import { createCommitDraft, type CommitDraft } from "~/lib/repository-drafts";
import type { CommitFlowState, CommitRequest } from "./commit-flow";
import { git, WORKTREE, type CommitFile, type FileDiff, type History, type WorktreeDiffScope } from "~/lib/git";

export type WorktreeCommitProps = {
  draft?: CommitDraft;
  history?: History;
  onCommitted?: (history: History) => void;
  onCommitCreated?: () => void;
  onSubmitCommit?: (request: CommitRequest) => Promise<History>;
  commitPhase?: CommitFlowState["kind"];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
};
export function createWorktreeController(props: WorktreeCommitProps, presentation: Accessor<FilePresentation>) {
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
  const [fileQuery, setFileQuery] = createSignal("");
  const [searchOpen, setSearchOpen] = createSignal(false);
  let searchButton: HTMLButtonElement | undefined;
  function closeSearch() {
    setFileQuery("");
    setSearchOpen(false);
    searchButton?.focus();
  }
  const [fileFilter, setFileFilter] = createSignal("");
  createEffect(() => {
    const query = fileQuery().trim().toLocaleLowerCase();
    if (!query) { setFileFilter(""); return; }
    const timer = setTimeout(() => setFileFilter(query), 200);
    onCleanup(() => clearTimeout(timer));
  });
  const fileIndex = createMemo(() => indexFileSelection(files()));
  const visibleFiles = createMemo(() => {
    const query = fileFilter();
    return query ? files().filter(file => file.path.toLocaleLowerCase().includes(query)) : files();
  });
  const visibleIndex = createMemo(() => visibleFiles() === files() ? fileIndex() : indexFileSelection(visibleFiles()));
  const [loading, setLoading] = createSignal(props.history?.worktree_files === undefined);
  const [pending, setPending] = createSignal(false);
  const [selectedGroup, setSelectedGroup] = createSignal<WorktreeDiffScope>("unstaged");
  const [selectedDirectory, setSelectedDirectory] = createSignal("");
  const [selectedPath, setSelectedPath] = createSignal("");
  const [diff, setDiff] = createSignal<FileDiff>();
  const [diffLoading, setDiffLoading] = createSignal(false);
  const selectedFiles = createMemo(() => {
    if (selectedDirectory()) return fileIndex().filesIn(selectedDirectory());
    const file = fileIndex().byPath.get(selectedPath());
    return file ? [file] : [];
  });
  const directoryFiles = createMemo(() => selectedFiles().filter(file => !props.onCommitted || (selectedGroup() === "staged" ? file.staged : !file.staged || file.partially_staged))
    .sort((a, b) => compareChangedFiles(a, b, presentation().sort) * (presentation().descending ? -1 : 1)));
  const showScopeSwitch = () => props.onCommitted && hasDiffScope(selectedFiles(), "staged") && hasDiffScope(selectedFiles(), "unstaged");
  const allSelection = () => visibleIndex().root;
  const stagedCount = () => fileIndex().root.stagedCount;
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
        const nextIndex = untrack(fileIndex);
        if (directory) {
          const descendants = nextIndex.filesIn(directory);
          if (!descendants.length) setSelectedDirectory("");
          else if (props.onCommitted) setSelectedGroup(selectDiffScope(descendants, group));
          return;
        }
        const file = nextIndex.byPath.get(path);
        if (!path || !file) { setSelectedPath(""); setDiff(undefined); setDiffLoading(false); return; }
        const scope = props.onCommitted ? selectDiffScope([file], group) : undefined;
        if (scope) setSelectedGroup(scope);
        const next = await diffLoader.load({ project: props.history?.path ?? "", commit: WORKTREE, path, scope, revision: result.files }, () => mounted && request === loadRequest && diffVersion === diffRequest);
        if (mounted && request === loadRequest && diffVersion === diffRequest) setDiff(next);
      } catch { /* Preserve the current view; the terminal reports failures. */ }
      finally { if (mounted && request === loadRequest) setLoading(false); }
    })();
  });
  const canStageHunk = (data: FileDiff) => Boolean(props.onCommitted && !props.history?.operation
    && selectedGroup() === "unstaged" && data.file.status === "M" && !data.file.old_path && !data.truncated && !data.patch.includes("\uFFFD")
    && /^diff --git [^\n]+\nindex [^\n]+ 100(?:644|755)\n--- [^\n]+\n\+\+\+ [^\n]+\n@@ /.test(data.patch));

  async function stageHunk(data: FileDiff, index: number) {
    if (!canStageHunk(data) || disabled()) return;
    setPending(true); props.onBusyChange(true);
    try {
      const { files: updated } = await git.stageWorktreeHunk(data.file.path, data.patch, index);
      if (!mounted || !props.history) return;
      const file = updated.find(entry => entry.path === data.file.path);
      if (!selectedDirectory() && file?.staged && !file.partially_staged) setSelectedGroup("staged");
      setFiles(updated);
      props.onCommitted?.({ ...props.history, worktree_files: updated, has_changes: updated.length > 0, conflicts: updated.filter(entry => entry.status === "U") });
    } catch {
      try { if (mounted) props.onCommitted?.(await git.getHistory()); } catch { /* The terminal already reports the failure. */ }
    } finally { setPending(false); props.onBusyChange(false); }
  }

  async function stageFile(file: CommitFile, staged: boolean) {
    await stageFiles([file], staged);
  }
  async function stageFiles(selected: CommitFile[], staged: boolean) {
    if (!props.onCommitted || disabled()) return;
    setPending(true); props.onBusyChange(true);
    try {
      const updated = await stageSelectedFiles(selected, staged, git.setFilesStaged);
      if (mounted && updated) setFiles(updated);
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
    if (props.onCommitted) setSelectedGroup(selectDiffScope(fileIndex().filesIn(path), scope));
    setSelectedDirectory(path);
  }
  async function openFile(file: CommitFile, scope?: WorktreeDiffScope) {
    if (disabled()) return;
    const request = ++diffRequest;
    setSelectedDirectory("");
    const diffScope = props.onCommitted ? selectDiffScope([file], scope) : undefined;
    if (diffScope) setSelectedGroup(diffScope);
    const spec = { project: props.history?.path ?? "", commit: WORKTREE, path: file.path, scope: diffScope, revision: files() };
    const cached = diffLoader.peek(spec);
    setSelectedPath(file.path); setDiff(cached); setDiffLoading(!cached);
    try { const result = await diffLoader.load(spec, () => mounted && request === diffRequest); if (request === diffRequest) setDiff(result); }
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
  return {
    sign, setSign, amendTarget, amendConfirmed, setAmendConfirmed, toggleAmend,
    pushRemote, setPushRemote, pushAfterCommit, setPushAfterCommit, message, setMessage,
    files, fileQuery, setFileQuery, searchOpen, setSearchOpen, closeSearch, fileFilter,
    visibleFiles, fileIndex, visibleIndex, loading, pending, selectedGroup, selectedDirectory, selectedPath,
    diff, diffLoading, directoryFiles, selectedFiles, showScopeSwitch, allSelection,
    stagedCount, disabled, canAmend, amendValid, canSubmit, canStageHunk, stageHunk,
    stageFile, stageFiles, openDirectory, openFile, submit,
    setSearchButton: (element: HTMLButtonElement) => { searchButton = element; },
  };
}
