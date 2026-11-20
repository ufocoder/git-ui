import { PanelHeader } from "~/components/ui/panel-header";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import FileTableHeader from "~/components/sections/file-table-header";
import ChangedFilesBrowser from "~/components/sections/changed-files-browser";
import { stagingSelection, hasDiffScope, selectDiffScope } from "./staging-selection";
import CommitMessageFields from "./commit-message-fields";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { readPanelSizes, validPanelSizes } from "~/lib/layout-preferences";
import DirectoryDiffView from "~/components/sections/directory-diff-view";
import { filesInDirectory } from "~/lib/file-tree";
import { compareChangedFiles } from "~/lib/file-presentation";
import FileViewControls from "./file-view-controls";
import { readFilePresentation, saveFilePresentation } from "~/lib/file-presentation";
import { createCommitDraft, type CommitDraft } from "~/lib/repository-drafts";
import { t, locale } from "~/lib/i18n";
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
  const composerVisible = () => Boolean(props.onCommitted && !props.history?.operation);
  const [composerSizes, setComposerSizes] = createSignal(untrack(() => readPanelSizes(props.history?.path ?? "global", "changes.composer", [0.75, 0.25])));
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
  const visibleFiles = createMemo(() => files().filter(file => {
    const query = fileFilter();
    if (!query) return true;
    const path = file.path.toLocaleLowerCase();
    return path.includes(query);
  }));
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
  const selectedFiles = createMemo(() => selectedDirectory() ? filesInDirectory(files(), selectedDirectory()) : files().filter(file => file.path === selectedPath()));
  const showScopeSwitch = () => props.onCommitted && hasDiffScope(selectedFiles(), "staged") && hasDiffScope(selectedFiles(), "unstaged");
  const allSelection = createMemo(() => stagingSelection(visibleFiles()));
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
          const descendants = filesInDirectory(result.files, directory);
          if (!descendants.length) setSelectedDirectory("");
          else if (props.onCommitted) setSelectedGroup(selectDiffScope(descendants, group));
          return;
        }
        const file = result.files.find(file => file.path === path);
        if (!path || !file) { setSelectedPath(""); setDiff(undefined); setDiffLoading(false); return; }
        const scope = props.onCommitted ? selectDiffScope([file], group) : undefined;
        if (scope) setSelectedGroup(scope);
        const next = await git.getFileDiff(WORKTREE, path, scope);
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
      const paths = selected
        .filter(file => staged ? !file.staged || file.partially_staged : file.staged)
        .map(file => file.path);
      const updated = paths.length ? (await git.setFilesStaged(paths, staged)).files : undefined;
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
    if (props.onCommitted) setSelectedGroup(selectDiffScope(filesInDirectory(files(), path), scope));
    setSelectedDirectory(path);
  }
  async function openFile(file: CommitFile, scope?: WorktreeDiffScope) {
    if (disabled()) return;
    const request = ++diffRequest;
    setSelectedDirectory("");
    const diffScope = props.onCommitted ? selectDiffScope([file], scope) : undefined;
    if (diffScope) setSelectedGroup(diffScope);
    setSelectedPath(file.path); setDiff(undefined); setDiffLoading(true);
    try { const result = await git.getFileDiff(WORKTREE, file.path, diffScope); if (request === diffRequest) setDiff(result); }
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
  return <Resizable layoutId="changes.composer" orientation="vertical" initialSizes={composerSizes()} sizes={composerVisible() ? composerSizes() : [1, 0]}
    onSizesChange={sizes => { if (composerVisible() && validPanelSizes(sizes, 2)) setComposerSizes(sizes); }} class="min-h-0 min-w-0">
    <ResizablePanel minSize={0.3} class="min-h-0 overflow-hidden"><Resizable layoutId={props.onCommitted ? "changes.files" : "history.worktree"} orientation="horizontal" initialSizes={panelSizes} class="min-h-0 min-w-0">
    <ResizablePanel initialSize={panelSizes[0]} minSize={0.2} class="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <Show when={!props.onCommitted} fallback={<>
        <PanelHeader class="px-4 [&>div]:w-full">
          <FileViewControls value={presentation()} onChange={value => { setPresentation(value); saveFilePresentation(value); }}
            actions={<>
            <Show when={searchOpen()}>
              <DropdownMenu>
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-7" aria-label={t("stage.repository-actions")} title={t("stage.repository-actions")} disabled={disabled()}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem checked={files().every(file => file.staged && !file.partially_staged)}
                    onChange={checked => void stageFiles(files(), checked)}>
                    {t("stage.repository-files", { count: files().length.toLocaleString(locale()) })}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Show>
            </>}
            leading={<>
              <h3 class="min-w-0 truncate text-xs font-medium" aria-label={t("commit.staged-count", { count: stagedCount(), total: files().length })}>{t("stage.selection-count", { count: stagedCount().toLocaleString(locale()), total: files().length.toLocaleString(locale()) })}</h3>
            </>}

            />
        </PanelHeader>
          <div aria-busy={pending()} class="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-1 text-xs">
            <label class="flex cursor-pointer items-center gap-2">
              <Checkbox class="space-x-0" checked={allSelection().checked} indeterminate={allSelection().indeterminate} disabled={disabled() || !visibleFiles().length || fileQuery().trim().toLocaleLowerCase() !== fileFilter()}
                onChange={checked => void stageFiles(visibleFiles(), checked)}
                aria-label={fileFilter() ? (allSelection().checked ? t("stage.unstage-matches", { count: visibleFiles().length.toLocaleString(locale()) }) : t("stage.stage-matches", { count: visibleFiles().length.toLocaleString(locale()) })) : allSelection().checked ? t("stage.unstage-all") : t("stage.all")} />
              <Show when={pending()} fallback={<Show when={!searchOpen()}>
                <span>{allSelection().checked ? t("stage.exclude-all") : t("stage.include-all")}</span>
              </Show>}>
                <span role="status" class="text-muted-foreground">{t("stage.updating")}</span>
              </Show>
            </label>
            <Show when={searchOpen()} fallback={<Button ref={element => { searchButton = element; }} variant="ghost" size="icon" class="ml-auto size-7 shrink-0" aria-label={t("changes.search")} title={t("changes.search")} aria-expanded={searchOpen()} onClick={() => searchOpen() ? closeSearch() : setSearchOpen(true)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
            </Button>}><div class="flex min-w-0 flex-1 items-center gap-2">
                <TextField class="min-w-0 flex-1" value={fileQuery()} onChange={setFileQuery}>
                  <TextFieldInput ref={element => queueMicrotask(() => element.focus())} class="h-7 px-2 text-xs focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-offset-0" placeholder={t("changes.search")} aria-label={t("changes.search")} type="search" spellcheck={false} autocorrect="off" autocapitalize="off" autocomplete="off"
                    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSearch(); } }} />
                </TextField>
                <Show when={fileFilter()}><span role="status" class="shrink-0 text-xs text-muted-foreground tabular-nums">{t("changes.search-count", { count: visibleFiles().length.toLocaleString(locale()), total: files().length.toLocaleString(locale()) })}</span></Show>


              <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label={t("dialog.close")} title={t("dialog.close")} onClick={closeSearch}>
                <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M6 18 18 6" /></svg>
              </Button>
            </div></Show>
          </div>
      <div data-file-scroll class="min-h-0 flex-1 overflow-auto">
      <section class={props.onCommitted ? (presentation().view === "list" ? "" : "pl-4 pt-2") : "px-4"} data-file-navigation aria-label={t("commit.files")}>

        <Show when={presentation().view === "list"}>
          <div class="flex border-b">
            <div aria-hidden="true" class="h-8 w-12 shrink-0" />
            <FileTableHeader class="min-w-0 flex-1 border-b-0 px-1" presentation={presentation()} onPresentationChange={value => { setPresentation(value); saveFilePresentation(value); }} />
          </div>
        </Show>
        <Show when={fileFilter() && !visibleFiles().length}><p role="status" class="px-4 py-3 text-xs text-muted-foreground">{t("changes.no-results")}</p></Show>
        <Show when={loading()}><p role="status" class="sr-only">{t("commit.loading-files")}</p></Show>
        <Show when={!loading() && !files().length}><div class="mt-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground" role="status">{t("commit.clean")}</div></Show>
        <Show when={props.onCommitted && (loading() || files().length > 0)} fallback={<div classList={{ "-mx-4 [&_[data-file-row]]:px-5": presentation().view === "list" }}><ChangedFilesTree virtual presentation={presentation()} files={visibleFiles()} selectedPath={selectedDirectory() || selectedPath()} disabled={disabled()} onSelect={file => void openFile(file)} onSelectDirectory={openDirectory} /></div>}>

          <ChangedFilesTree virtual presentation={presentation()} files={visibleFiles()} selectedPath={selectedDirectory() || selectedPath()} disabled={disabled()}
            onSelect={file => void openFile(file)} onSelectDirectory={openDirectory}
            renderDirectoryControl={(path, descendants) => {
              const state = () => stagingSelection(descendants);
              return <Checkbox class="space-x-0" checked={state().checked} indeterminate={state().indeterminate} disabled={disabled()}
                onChange={checked => void stageFiles(descendants, checked)} aria-label={state().checked ? t("stage.unstage-file", { path }) : t("stage.file", { path })} />;
            }}
            renderControl={file => <Checkbox class="space-x-0" checked={file.staged && !file.partially_staged} indeterminate={file.partially_staged} disabled={disabled()}
              onChange={checked => void stageFile(file, checked)} aria-label={file.staged && !file.partially_staged ? t("stage.unstage-file", { path: file.path }) : t("stage.file", { path: file.path })} />} />
        </Show>
      </section>
      </div>
      </>}>
        <ChangedFilesBrowser presentation={presentation()} onPresentationChange={value => { setPresentation(value); saveFilePresentation(value); }}
          loading={loading()} commit={WORKTREE} files={files()} selectedPath={selectedDirectory() || selectedPath()} disabled={disabled()}
          onSelect={file => void openFile(file)} onSelectDirectory={openDirectory} />
      </Show>
    </ResizablePanel>
    <ResizableHandle withHandle aria-label={t("commit.resize")} />
    <ResizablePanel initialSize={panelSizes[1]} minSize={0.25} class="min-h-0 min-w-0 overflow-hidden">
      <section class="flex h-full min-h-0 flex-col px-4 pb-4" aria-label={t("details.diff")}>
        <Show when={showScopeSwitch()}><div class="flex shrink-0 gap-1 py-1" role="group" aria-label={t("stage.diff-scope")}>
          <For each={["unstaged", "staged"] as const}>{scope => <Button size="sm" class="h-7 px-2 text-xs" variant={selectedGroup() === scope ? "secondary" : "ghost"} aria-pressed={selectedGroup() === scope} disabled={disabled()}
            onClick={() => { if (selectedDirectory()) openDirectory(selectedDirectory(), scope); else { const file = selectedFiles()[0]; if (file) void openFile(file, scope); } }}>{scope === "staged" ? t("stage.staged") : t("stage.unstaged")}</Button>}</For>
        </div></Show>
        <div class="min-h-0 flex-1">
          <Show when={selectedDirectory()} fallback={<>
          <Show when={diffLoading()}><p role="status" class="pt-4 text-sm text-muted-foreground">{t("details.loading-diff")}</p></Show>
          <Show when={diff()}>{data => <FileDiffView diff={data()} scope={props.onCommitted ? selectedGroup() : undefined} stageDisabled={disabled()}
            onStageHunk={canStageHunk(data()) ? index => void stageHunk(data(), index) : undefined} />}</Show>
          <Show when={!selectedPath() && (loading() || files().length > 0)}><p class="pt-4 text-sm text-muted-foreground">{t("commit.select-file")}</p></Show>
          </>}>
            <DirectoryDiffView path={selectedDirectory()} files={directoryFiles()} commit={WORKTREE} scope={props.onCommitted ? selectedGroup() : undefined}
              canStageHunk={canStageHunk} onStageHunk={(data, index) => void stageHunk(data, index)} stageDisabled={disabled()} />
          </Show>
        </div>
      </section>
    </ResizablePanel>
  </Resizable></ResizablePanel>
    <ResizableHandle withHandle class={composerVisible() ? "" : "hidden"} aria-label={t("commit.resize-message")} />
    <ResizablePanel minSize={composerVisible() ? 0.15 : 0} maxSize={composerVisible() ? 0.6 : 0} class="min-h-0 overflow-hidden">
    <Show when={composerVisible()}>
      <div class="panel-surface flex h-full min-h-0 flex-col overflow-y-auto px-4 pt-2">
          <form onSubmit={submit} class="flex min-h-full flex-1 flex-col gap-2 [&>div:not(:first-child)]:shrink-0">
            <CommitMessageFields value={message()} onChange={setMessage} disabled={disabled()} />
            <Show when={amendTarget()}>
              <div class="space-y-2 border-l-2 border-warning-foreground pl-3">
                <p class="text-xs text-muted-foreground">{t("commit.amending", { sha: amendTarget()!.head.slice(0, 8) })}</p>
                <Show when={!amendValid()}><p role="alert" class="text-xs text-destructive">{t("operation.stale-target")}</p></Show>
                <label class="flex items-start gap-2 text-xs text-muted-foreground"><Checkbox checked={amendConfirmed()} onChange={setAmendConfirmed} disabled={disabled()} />{t("operation.confirm-amend")}</label>
              </div>
            </Show>
            <Show when={pushAfterCommit() && !props.history?.sync.upstream}>
              <div class="flex flex-wrap items-center justify-end gap-2 text-xs">
                <span>{t("upstream.push-remote")}</span>
                <SelectField class="w-48 max-w-full" aria-label={t("upstream.push-remote")} value={pushRemote()} disabled={disabled()}
                  options={(props.history?.remotes ?? []).map(entry => ({ value: entry.name, label: entry.name }))} onChange={setPushRemote} />
              </div>
            </Show>
            <div class="panel-actions -mx-4 flex min-h-[var(--panel-footer-height)] flex-wrap items-center justify-end gap-2 border-t px-4 py-2">
              <label class="mr-auto flex w-fit shrink-0 cursor-pointer items-center gap-2 text-xs" title={!props.history?.remotes.length ? t("upstream.no-remotes") : undefined}>
              <Checkbox checked={pushAfterCommit()} onChange={setPushAfterCommit} disabled={disabled() || !props.history?.remotes.length || !props.history?.current_branch} aria-label={t("commit.push-after")} />
              <span>{t("commit.push-after")}</span>
            </label>
              <DropdownMenu placement="top-start" gutter={4}>
                <DropdownMenuTrigger as={Button} type="button" variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs text-muted-foreground" disabled={disabled()}>
                  {t("compose.options")}<span aria-hidden="true">{sign() || amendTarget() ? "✓" : "⋯"}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem checked={sign()} onChange={setSign} disabled={disabled()} title={t("commit.sign-description")}>{t("commit.sign")}</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={Boolean(amendTarget())} onChange={enabled => void toggleAmend(enabled)} disabled={disabled() || (!amendTarget() && !canAmend())} title={t("compose.amend-warning")}>{t("commit.amend")}</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Show when={!loading() && !amendTarget() && !stagedCount() && unstagedFiles().length}>
                <p role="status" class="text-xs text-muted-foreground">{t("commit.stage-hint")}</p>
              </Show>
              <Button type="submit" class="h-control-toolbar px-control-sm-x" disabled={!canSubmit()}>{props.commitPhase === "pushing" ? t("push.running") : props.commitPhase === "committing" ? t("common.saving") : amendTarget() ? t("operation.amend-commit") : t("commit.create")}</Button>
            </div>
          </form>
      </div>
    </Show>
    </ResizablePanel>
  </Resizable>;
}
