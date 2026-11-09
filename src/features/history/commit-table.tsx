import { offerHistoryRecovery } from "~/lib/operation-feedback";
import HistoryRewriteDialog, { type HistoryRewriteAction } from "./history-rewrite-dialog";
import * as Popover from "@kobalte/core/popover";
import ReferenceAutocomplete from "./reference-autocomplete";
import { createCommitGraph, graphEdgePath } from "~/lib/commit-graph";
import { preservedSelection, anchoredScroll } from "~/lib/history-view";
import { matchesShortcut } from "~/lib/keyboard-shortcuts";
import { createHistorySearch, type HistorySearch } from "~/lib/repository-drafts";
import { locale, t } from "~/lib/i18n";
import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount, on, untrack, batch } from "solid-js";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "~/components/ui/context-menu";
import CommitEditDialog, { type CommitEditAction } from "./commit-edit-dialog";
import CommitActionsDialog, { type CommitDialogAction } from "./commit-actions-dialog";
import { CommitDescription } from "~/components/ui/commit-description";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "~/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import HistoryFilters from "./history-filters";
import WorktreeCommit from "~/features/changes/worktree-commit";
import CommitFiles from "~/components/sections/commit-files";
import { reportTerminalError } from "~/lib/terminal";
import { git, createWorktreeCommit, type Commit, type HistoryScope, type HistoryFilter, type History } from "~/lib/git";

const ROW_HEIGHT = 34;

export default function CommitTable(props: { branch: string; onBranchChange: (branch: string) => void; search?: HistorySearch; scope: HistoryScope; history: History; disabled: boolean; onHistoryChange: (history: History) => void; onBusyChange: (busy: boolean) => void }) {
  let viewport!: HTMLDivElement;
  let header!: HTMLTableSectionElement;
  let searchButton!: HTMLButtonElement;
  const searchId = createUniqueId();
  const search = props.search ?? createHistorySearch();
  const [searchOpen, setSearchOpen] = search.open;
  const [headerHeight, setHeaderHeight] = createSignal(ROW_HEIGHT);
  let generation = 0;
  const [filter, setFilter] = search.filter;
  const [appliedFilter, setAppliedFilter] = createSignal<HistoryFilter>(untrack(filter));
  const [debouncing, setDebouncing] = createSignal(false);
  const filtered = createMemo(() => Boolean(appliedFilter().text.trim() || appliedFilter().sha.trim() || appliedFilter().author.trim() || appliedFilter().file));
  createEffect(on(filter, value => {
    generation++; setDebouncing(true); setLoading(false);
    const timer = window.setTimeout(() => { setAppliedFilter({ text: value.text.trim(), sha: value.sha.trim(), author: value.author.trim(), file: value.file }); setDebouncing(false); }, 250);
    onCleanup(() => window.clearTimeout(timer));
  }, { defer: true }));
  const [editAction, setEditAction] = createSignal<CommitEditAction>();
  const [dialogAction, setDialogAction] = createSignal<CommitDialogAction>();
  const [selectedCommit, setSelectedCommit] = createSignal<Commit>();
  const [selectionAnchor, setSelectionAnchor] = createSignal<string>();
  const [rangeSelection, setRangeSelection] = createSignal<Commit[]>([]);
  const [rewriteAction, setRewriteAction] = createSignal<HistoryRewriteAction>();
  const [commits, setCommits] = createSignal<Commit[]>([]);
  const [graphRevision, setGraphRevision] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copyStatus, setCopyStatus] = createSignal("");
  const [scrollTop, setScrollTop] = createSignal(0);
  const [height, setHeight] = createSignal(500);
  const [jumpRef, setJumpRef] = search.jumpRef;
  const [branchPickerOpen, setBranchPickerOpen] = createSignal(false);
  const branches = createMemo(() => [
    { value: "all", label: t("history.all-branches") },
    ...props.history.branches.map(branch => ({ value: `refs/heads/${branch}`, label: branch })),
  ]);
  const jumpOptions = createMemo(() => [
    ...branches().slice(1),
    ...props.history.remotes.flatMap(remote => remote.branches.map(branch => ({
      value: `refs/remotes/${remote.name}/${branch}`, label: `${remote.name}/${branch}`,
    }))),
    ...props.history.tags.filter(tag => props.history.tag_tips?.[tag]).map(tag => ({ value: `refs/tags/${tag}`, label: t("history.jump-tag", { tag }) })),
  ]);
  const referenceTip = (ref: string) => ref.startsWith("refs/tags/") ? props.history.tag_tips?.[ref.slice(10)] : props.history.branch_tips?.[ref];
  const jumpTip = () => referenceTip(jumpRef());
  const allBranches = () => props.branch === "all" && !jumpTip();
  const historyTips = () => props.history.branch_tips
    ? Object.values(props.history.branch_tips)
    : undefined;
  function jumpTo(ref: string) {
    const hash = referenceTip(ref);
    if (!hash) return;
    const rows = displayedCommits();
    const index = rows.findIndex(commit => commit.hash === hash);
    if (index >= 0 && !loading() && !debouncing()) {
      selectRow(rows[index], false);
      viewport.scrollTop = index * ROW_HEIGHT;
      setScrollTop(viewport.scrollTop);
    } else {
      batch(() => {
        setFilter({ text: "", sha: "", author: "", file: "" });
        setJumpRef(ref);
      });
    }
  }
  const viewingHead = () => !jumpTip() && (allBranches() || props.branch === "current" || props.branch === `refs/heads/${props.history.current_branch}`);
  const selectedTip = () => jumpTip() ?? (allBranches() || props.branch === "current" ? props.history.tip : props.history.branch_tips?.[props.branch] ?? (viewingHead() ? props.history.tip : ""));
  const worktreeCommit = createMemo(() => createWorktreeCommit(props.history.tip));
  const displayedCommits = createMemo(() => props.scope === "all" && viewingHead() && !filtered() && props.history.has_changes ? [worktreeCommit(), ...commits()] : commits());
  const rangeHashes = createMemo(() => new Set(rangeSelection().map(commit => commit.hash)));
  const canRewrite = () => !props.disabled && Boolean(props.history.current_branch) && !props.history.has_changes && !props.history.operation;
  const squashRange = (commit: Commit) => rangeHashes().has(commit.hash) ? rangeSelection() : [];
  const linearRange = (range: Commit[]) => range.length > 1 && range.every((commit, index) =>
    commit.parents.length <= 1 && (index === 0 || commit.parents[0] === range[index - 1].hash));
  function selectRow(commit: Commit, extend: boolean) {
    const rows = displayedCommits();
    const anchorHash = selectionAnchor() ?? selectedCommit()?.hash;
    const anchor = rows.findIndex(row => row.hash === anchorHash);
    const index = rows.indexOf(commit);
    if (extend && anchor >= 0 && index >= 0 && !commit.uncommitted && !rows[anchor].uncommitted) {
      setSelectionAnchor(anchorHash);
      setRangeSelection(rows.slice(Math.min(anchor, index), Math.max(anchor, index) + 1).reverse());
    } else {
      setSelectionAnchor(commit.hash);
      setRangeSelection([]);
    }
    setSelectedCommit(commit);
  }
  function openRewrite(commits: Commit[]) {
    setRewriteAction({ head: props.history.tip, branch: props.history.current_branch, commits });
  }
  let previousContext = "";
  createEffect(() => {
    const history = props.history;
    const scope = props.scope;
    const tip = selectedTip(), includeBranches = allBranches(), showWorktree = viewingHead();
    const search = appliedFilter();
    const hasFilter = filtered();
    const tips = historyTips();
    const context = JSON.stringify([history.path, history.current_branch, props.branch, scope, search, jumpRef()]);
    const preserve = previousContext === context;
    previousContext = context;
    const previous = untrack(selectedCommit);
    const previousRows = untrack(displayedCommits);
    const previousCount = untrack(commits).length;
    const top = viewport?.scrollTop ?? untrack(scrollTop);
    const anchorIndex = Math.floor(Math.max(0, top - untrack(headerHeight)) / ROW_HEIGHT);
    const anchor = previousRows[anchorIndex]?.hash;
    const offset = top - anchorIndex * ROW_HEIGHT;
    const request = ++generation;
    setRangeSelection([]); setSelectionAnchor(undefined);
    setError(""); setLoading(true);
    if (!preserve) {
      setScrollTop(0); if (viewport) viewport.scrollTop = 0;
      setSelectedCommit(undefined);
    }
    const pageAt = (offset: number) => hasFilter
      ? git.getFilteredCommitPage(tip, history.sync.remote_tip, scope, search, offset, includeBranches, tips)
      : scope === "all" ? git.getCommitPage(tip, offset, includeBranches, tips)
      : history.sync.remote_tip ? git.getSyncCommitPage(history.tip, history.sync.remote_tip, scope, offset)
      : Promise.resolve({ commits: [], has_more: false });
    void (async () => {
      try {
        let page = scope === "all" && includeBranches && !hasFilter
          ? { commits: history.commits, has_more: history.has_more }
          : await pageAt(0);
        let updated = [...page.commits];
        while (preserve && page.has_more && (updated.length < previousCount || (previous && !previous.uncommitted && !updated.some(commit => commit.hash === previous.hash)))) {
          page = await pageAt(updated.length);
          if (request !== generation) return;
          if (!page.commits.length) break;
          updated.push(...page.commits);
        }
        if (request !== generation) return;
        const rows = scope === "all" && showWorktree && !hasFilter && history.has_changes ? [createWorktreeCommit(history.tip), ...updated] : updated;
        batch(() => {
          setGraphRevision(revision => revision + 1);
          setCommits(updated); setHasMore(page.has_more);
          setSelectedCommit(preserve ? preservedSelection(previous, rows) : rows[0]);
        });
        const restored = preserve ? anchoredScroll(rows, anchor, offset, top, ROW_HEIGHT) : 0;
        queueMicrotask(() => {
          if (request !== generation || !viewport) return;
          viewport.scrollTop = restored; setScrollTop(viewport.scrollTop);
        });
      } catch (failure) { if (request === generation) setError(String(failure)); }
      finally { if (request === generation) setLoading(false); }
    })();
  });
  onMount(() => {
    const observer = new ResizeObserver(() => { setHeight(viewport.clientHeight); setHeaderHeight(header.clientHeight); });
    observer.observe(viewport);
    observer.observe(header);
    setHeaderHeight(header.clientHeight);
    setHeight(viewport.clientHeight);
    onCleanup(() => observer.disconnect());
  });
  onCleanup(() => { generation++; });

  async function loadMore() {
    if (debouncing() || loading() || !hasMore() || props.disabled) return;
    const request = generation;
    const tip = selectedTip();
    setLoading(true);
    setError("");
    try {
      const scope = props.scope;
      const remoteTip = props.history.sync.remote_tip;
      const page = filtered() ? await git.getFilteredCommitPage(tip, remoteTip, scope, appliedFilter(), commits().length, allBranches(), historyTips())
        : scope === "all" ? await git.getCommitPage(tip, commits().length, allBranches(), historyTips())
        : remoteTip ? await git.getSyncCommitPage(tip, remoteTip, scope, commits().length) : { commits: [], has_more: false };
      if (request !== generation) return;
      batch(() => {
        setCommits(previous => [...previous, ...page.commits]);
        if (!selectedCommit()) setSelectedCommit(page.commits[0]);
        setHasMore(page.has_more);
      });
    } catch (e) { if (request === generation) setError(String(e)); }
    finally { if (request === generation) setLoading(false); }
  }
  createEffect(() => {
    const nearBottom = scrollTop() + height() >= headerHeight() + displayedCommits().length * ROW_HEIGHT - height();
    if (!debouncing() && nearBottom && hasMore() && !loading() && !error() && !props.disabled) untrack(() => void loadMore());
  });

  let graphBuilder = createCommitGraph();
  let builtRevision = -1;
  let firstGraphCommit: Commit | undefined;
  const graph = createMemo(() => {
    const rows = displayedCommits();
    const revision = graphRevision();
    if (revision !== builtRevision || rows[0] !== firstGraphCommit || rows.length < graphBuilder.length) {
      graphBuilder = createCommitGraph();
      builtRevision = revision;
      firstGraphCommit = rows[0];
    }
    return graphBuilder.append(rows.slice(graphBuilder.length));
  });
  const start = createMemo(() => Math.max(0, Math.floor(Math.max(0, scrollTop() - headerHeight()) / ROW_HEIGHT) - Math.ceil(height() / ROW_HEIGHT)));
  const end = createMemo(() => Math.min(displayedCommits().length, start() + Math.ceil(height() / ROW_HEIGHT) * 3 + 4));
  const visibleCommits = createMemo(() => displayedCommits().slice(start(), end()));
  const date = (value: string) => new Date(value).toLocaleString(locale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  async function runAction(operation: () => Promise<History>) {
    if (props.disabled) throw new Error(t("history.busy"));
    props.onBusyChange(true); setError("");
    try { props.onHistoryChange(await operation()); }
    catch (error) {
      try { props.onHistoryChange(await git.getHistory()); } catch { /* Keep the last available history. */ }
      throw error;
    }
    finally { props.onBusyChange(false); }
  }
  async function checkout(commit: Commit) {
    try { await runAction(() => git.checkoutCommit(commit.hash)); }
    catch (e) { setError(String(e)); }
  }

  async function saveCommitHash(commit: Commit) {
    setError(""); setCopyStatus("");
    try {
      await navigator.clipboard.writeText(commit.hash);
      setCopyStatus(t("history.hash-copied"));
    } catch (e) { reportTerminalError(t("history.copy-failed", { p1: String(e) }), t("history.copy-hash")); }
  }

  return (
    <Resizable layoutId="history.table" orientation="vertical" initialSizes={[0.55, 0.45]} class="min-h-0 min-w-0 overflow-hidden">
      <ResizablePanel minSize={0.2} class="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div class="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/40 px-4 py-1">
        <span class="mr-1 text-xs text-muted-foreground">{t("history.branch-filter")}</span>
        <Popover.Root open={branchPickerOpen()} onOpenChange={setBranchPickerOpen} placement="bottom-start" gutter={4}>
          <Popover.Trigger as={Button} variant="ghost" class="h-7 max-w-48 gap-1.5 px-2 text-xs" disabled={props.disabled} aria-label={t("history.branch-filter")}>
            <span class="truncate">{branches().find(option => option.value === props.branch)?.label ?? t("history.all-branches")}</span>
            <svg aria-hidden="true" class="size-3 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="z-50 w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md" aria-label={t("history.branch-filter")}>
              <Show when={branchPickerOpen()}>
                <ReferenceAutocomplete scopePicker options={branches()} disabled={props.disabled} onSelect={branch => batch(() => {
                  setJumpRef(""); props.onBranchChange(branch); setBranchPickerOpen(false);
                })} />
              </Show>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Show when={jumpTip()}>
          <Button variant="ghost" class="h-7 px-2 text-xs" disabled={props.disabled} onClick={() => setJumpRef("")}>{t("history.back-to-scope")}</Button>
        </Show>
        <div class="ml-auto flex items-center gap-1" onKeyDown={event => {
          if (!event.defaultPrevented && matchesShortcut("dismiss", event) && searchOpen()) {
            event.preventDefault(); setSearchOpen(false); searchButton.focus();
          }
        }}>
          <Show when={searchOpen()}>
            <ReferenceAutocomplete options={jumpOptions()} disabled={props.disabled || !jumpOptions().length} onSelect={jumpTo} />
          </Show>
          <Button ref={element => { searchButton = element; }} size="icon" variant={searchOpen() || filtered() ? "secondary" : "ghost"} class="size-6 shrink-0"
            aria-label={searchOpen() ? t("search.hide") : t("search.commits")} title={searchOpen() ? t("search.hide") : t("search.commits")}
            aria-expanded={searchOpen()} aria-controls={`${searchId}-fields ${searchId}-path`} onClick={() => setSearchOpen(open => !open)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          </Button>
        </div>
      </div>
      <Show when={rangeSelection().length > 1}>
        <div class="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-4 py-1">
          <span role="status" class="mr-auto text-xs text-muted-foreground">{t("rewrite.selected", { count: rangeSelection().length })}</span>
          <Button size="sm" variant="ghost" class="h-7 text-xs" disabled={!canRewrite() || !linearRange(rangeSelection())}
            onClick={() => openRewrite(rangeSelection())}>{t("rewrite.combine")}</Button>
          <Button size="sm" variant="ghost" class="h-7 text-xs" onClick={() => { setRangeSelection([]); setSelectionAnchor(selectedCommit()?.hash); }}>{t("search.clear")}</Button>
        </div>
      </Show>
      <Show when={filter().file}>
        <div class="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-3 py-1.5" role="status">
          <p class="min-w-0 break-all text-xs text-muted-foreground">{t("search.file-history", { path: filter().file })}</p>
          <Button size="sm" variant="ghost" class="h-7 shrink-0 px-2 text-xs" disabled={props.disabled} onClick={() => {
            setFilter({ text: "", sha: "", author: "", file: "" });
            setSearchOpen(false); searchButton?.focus();
          }}>{t("search.all-history")}</Button>
        </div>
      </Show>
      <Show when={debouncing() || (filtered() && loading())}><span role="status" class="sr-only">{t("search.searching")}</span></Show>
      <Table class="min-w-[850px] table-fixed border-separate border-spacing-0 font-sans text-sm font-normal leading-5" aria-label={t("app.commits")}
        containerProps={{
          ref: element => { viewport = element; },
          onScroll: () => setScrollTop(viewport.scrollTop),
          class: "min-h-0 flex-1 bg-background [overflow-anchor:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tabindex: 0,
          "aria-label": t("history.title"),
          "aria-busy": loading() || debouncing(),
        }}>
        <colgroup><col style={{ width: `max(4rem, calc(${graph().width}px + 0.5rem))` }} /><col /><col class="w-[110px]" /><col class="w-40" /><col class="w-[150px]" /></colgroup>
        <TableHeader ref={element => { header = element; }} class="history-columns sticky top-0 z-10" onKeyDown={event => {
          if (matchesShortcut("dismiss", event) && searchOpen()) {
            event.preventDefault(); setSearchOpen(false); searchButton.focus();
          }
        }}>
          <TableRow class="hover:bg-transparent">
            <For each={[t("history.graph"), t("history.subject"), t("history.hash"), t("history.author"), t("history.date")]}>{heading =>
              <TableHead scope="col" class="h-[34px] border-b first:pl-4">
                {heading}
              </TableHead>
            }</For>
          </TableRow>
          <Show when={searchOpen()}><HistoryFilters id={searchId} filter={filter()} onChange={setFilter} disabled={props.disabled} /></Show>
        </TableHeader>
        <TableBody>
          <Show when={start() > 0}><TableRow aria-hidden="true" class="border-0 hover:bg-transparent"><TableCell colspan="5" class="p-0" style={{ height: `${start() * ROW_HEIGHT}px` }} /></TableRow></Show>
          <For each={visibleCommits()}>{(commit, index) => {
            const graphRow = () => graph().rows[start() + index()];
            return <ContextMenu>
              <ContextMenuTrigger as={TableRow} disabled={props.disabled || commit.uncommitted}
                data-state={selectedCommit()?.hash === commit.hash || rangeHashes().has(commit.hash) ? "selected" : undefined}
                aria-selected={selectedCommit()?.hash === commit.hash || rangeHashes().has(commit.hash)} tabindex={props.disabled ? -1 : 0}
                onClick={event => { if (!props.disabled) selectRow(commit, event.shiftKey); }}
                onKeyDown={event => { if (!props.disabled && event.target === event.currentTarget && matchesShortcut("selectCommit", event)) { event.preventDefault(); selectRow(commit, event.shiftKey); } }}
                class="commit-row data-[state=selected]:[&>td:first-child]:border-l-primary [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring h-[34px] [&>td]:h-[34px] [&>td]:overflow-hidden [&>td]:text-ellipsis [&>td]:whitespace-nowrap [&>td]:border-b [&>td]:py-0">
                <TableCell class="pl-2 pr-0">
                  <svg class={commit.uncommitted ? "block opacity-40" : "block"} width={graph().width} height={ROW_HEIGHT - 1} viewBox={`0 0 ${graph().width} ${ROW_HEIGHT}`} aria-label={t("history.parents", { p1: commit.parents.length })}>
                    <For each={graphRow().edges}>{edge =>
                      <path d={graphEdgePath(edge, ROW_HEIGHT)} stroke-linecap="round" fill="none" stroke={`hsl(calc(var(--graph-hue-start) + ${edge.color} * var(--graph-hue-step)) var(--graph-saturation) var(--graph-lightness))`} style={{ "stroke-width": "var(--graph-stroke-width)" }} />
                    }</For>
                    <circle cx={12 + graphRow().column * 16} cy="17" style={{ r: "var(--graph-node-radius)", "stroke-width": "var(--graph-node-border)" }} fill={`hsl(calc(var(--graph-hue-start) + ${graphRow().color} * var(--graph-hue-step)) var(--graph-saturation) var(--graph-lightness))`} stroke="hsl(var(--background))" />
                  </svg>
                </TableCell>
                <TableCell><CommitDescription subject={commit.subject} references={commit.refs} currentBranch={props.history.current_branch} bold={commit.uncommitted} /></TableCell>
                <TableCell>
                  <Show when={!commit.uncommitted} fallback={<span aria-label={t("details.uncommitted")}>*</span>}>
                  <Tooltip openDelay={350}>
                    <TooltipTrigger class="rounded-sm font-sans text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("history.full-hash", { p1: commit.hash })}>
                      {commit.hash.slice(0, 8)}
                    </TooltipTrigger>
                    <TooltipContent class="max-w-[90vw] break-all font-mono text-xs">{commit.hash}</TooltipContent>
                  </Tooltip>
                  </Show>
                </TableCell>
                <TableCell class="text-muted-foreground" title={commit.author}>{commit.author}</TableCell>
                <TableCell class="text-muted-foreground tabular-nums"><Show when={commit.date} fallback="—"><time dateTime={commit.date} title={commit.date}>{date(commit.date)}</time></Show></TableCell>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem disabled={props.disabled} onSelect={() => void saveCommitHash(commit)}>{t("history.copy-sha")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled} onSelect={() => void checkout(commit)}>{t("history.checkout")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled || !props.history.current_branch} onSelect={() => setDialogAction({ kind: "reset", commit })}>{t("reset.to-commit")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled} onSelect={() => setDialogAction({ kind: "branch", commit })}>{t("branch.from-commit")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled || !props.history.current_branch || props.history.has_changes || Boolean(props.history.operation)} title={props.history.has_changes ? t("operation.dirty") : undefined} onSelect={() => setEditAction({ kind: "cherry_pick", commit, head: props.history.tip, branch: props.history.current_branch })}>{t("operation.cherry-pick")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled || !props.history.current_branch || props.history.has_changes || Boolean(props.history.operation)} title={props.history.has_changes ? t("operation.dirty") : undefined} onSelect={() => setEditAction({ kind: "revert", commit, head: props.history.tip, branch: props.history.current_branch })}>{t("operation.revert")}</ContextMenuItem>
                <Show when={commit.hash === props.history.tip && props.history.has_changes}>
                  <ContextMenuItem disabled={props.disabled || !props.history.current_branch || Boolean(props.history.operation)}
                    onSelect={() => setEditAction({ kind: "amend", commit, head: props.history.tip, branch: props.history.current_branch })}>{t("operation.amend")}</ContextMenuItem>
                </Show>
                <ContextMenuItem disabled={!canRewrite()} onSelect={() => openRewrite([commit])}>{t("rewrite.reword")}</ContextMenuItem>
                <ContextMenuItem disabled={!canRewrite() || !linearRange(squashRange(commit))} title={t("rewrite.select-range")} onSelect={() => openRewrite(squashRange(commit))}>{t("rewrite.squash")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled} onSelect={() => setDialogAction({ kind: "tag", commit })}>{t("tag.from-commit")}</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>;
          }}</For>
          <Show when={end() < displayedCommits().length}><TableRow aria-hidden="true" class="border-0 hover:bg-transparent"><TableCell colspan="5" class="p-0" style={{ height: `${(displayedCommits().length - end()) * ROW_HEIGHT}px` }} /></TableRow></Show>
          <Show when={!loading() && !debouncing() && !error() && !displayedCommits().length}><TableRow><TableCell colspan="5" class="h-24 text-center text-muted-foreground"><div class="flex flex-col items-center gap-2 py-4"><p>{filtered() ? t("search.empty") : props.scope === "incoming" ? t("sync.no-incoming") : props.scope === "outgoing" ? t("sync.no-outgoing") : t("history.empty")}</p>
            <Show when={filtered()}><Button size="sm" variant="outline" disabled={props.disabled} onClick={() => setFilter({ text: "", sha: "", author: "", file: "" })}>{t("search.clear")}</Button></Show>
          </div></TableCell></TableRow></Show>
        </TableBody>
      </Table>
      <span role="status" class="sr-only">{copyStatus()}</span>
      <Show when={loading()}><span role="status" class="sr-only">{t("history.loading")}</span></Show>
      <Show when={error()}><Button variant="link" size="sm" class="shrink-0 self-start" onClick={() => { setHasMore(true); void loadMore(); }} disabled={props.disabled}>{t("history.retry")}</Button></Show>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t("history.resize")} />
      <ResizablePanel minSize={0.2} class="min-h-0 min-w-0 overflow-hidden">
        <Show when={selectedCommit()} fallback={<p class="p-4 text-sm text-muted-foreground">{t("history.no-selection")}</p>}>{commit => <Show when={commit().uncommitted} fallback={<CommitFiles commit={commit()} disabled={props.disabled} />}>
          <WorktreeCommit history={props.history} disabled={props.disabled} onBusyChange={props.onBusyChange} />
        </Show>}</Show>
      </ResizablePanel>
      <HistoryRewriteDialog action={rewriteAction()} onClose={() => setRewriteAction(undefined)}
        onExecute={(target, message, acceptPublished) => runAction(async () => {
          const history = await git.rewriteHistory(target, message, acceptPublished);
          previousContext = "";
          if (history.tip !== target.head) offerHistoryRecovery({ head: history.tip, branch: target.branch });
          return history;
        })} />
      <CommitEditDialog action={editAction()} onClose={() => setEditAction(undefined)} onExecute={(head, branch, operation) => runAction(() => git.commitOperation(head, branch, operation))} />
      <CommitActionsDialog action={dialogAction()} branch={props.history.current_branch} head={props.history.tip} disabled={props.disabled} hasChanges={props.history.has_changes} onClose={() => setDialogAction(undefined)}
        onReset={(commit, mode, confirmed, head, branch) => runAction(() => git.resetToCommit(commit, mode, confirmed, head, branch))}
        onBranch={(name, commit) => runAction(() => git.createBranchAtCommit(name, commit))}
        onTag={(name, commit) => runAction(() => git.createTagAtCommit(name, commit))} />
    </Resizable>
  );
}
