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
import WorktreeCommit from "./worktree-commit";
import CommitFiles from "~/components/sections/commit-files";
import { reportTerminalError } from "~/lib/terminal";
import { git, buildCommitGraph, createWorktreeCommit, type Commit, type HistoryScope, type HistoryFilter, type History } from "~/lib/git";

const ROW_HEIGHT = 34;

export default function CommitTable(props: { search?: HistorySearch; scope: HistoryScope; history: History; disabled: boolean; onHistoryChange: (history: History) => void; onBusyChange: (busy: boolean) => void }) {
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
  const [commits, setCommits] = createSignal<Commit[]>([]);
  const [hasMore, setHasMore] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copyStatus, setCopyStatus] = createSignal("");
  const [scrollTop, setScrollTop] = createSignal(0);
  const [height, setHeight] = createSignal(500);
  const worktreeCommit = createMemo(() => createWorktreeCommit(props.history.tip));
  const displayedCommits = createMemo(() => props.scope === "all" && !filtered() && props.history.has_changes ? [worktreeCommit(), ...commits()] : commits());
  let previousContext = "";
  createEffect(() => {
    const history = props.history;
    const scope = props.scope;
    const search = appliedFilter();
    const hasFilter = filtered();
    const context = JSON.stringify([history.path, history.current_branch, scope, search]);
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
    setError(""); setLoading(true);
    if (!preserve) {
      setScrollTop(0); if (viewport) viewport.scrollTop = 0;
      setSelectedCommit(undefined);
    }
    const pageAt = (offset: number) => hasFilter
      ? git.getFilteredCommitPage(history.tip, history.sync.remote_tip, scope, search, offset)
      : scope === "all" ? git.getCommitPage(history.tip, offset)
      : history.sync.remote_tip ? git.getSyncCommitPage(history.tip, history.sync.remote_tip, scope, offset)
      : Promise.resolve({ commits: [], has_more: false });
    void (async () => {
      try {
        let page = scope === "all" && !hasFilter
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
        const rows = scope === "all" && !hasFilter && history.has_changes ? [createWorktreeCommit(history.tip), ...updated] : updated;
        batch(() => {
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
    const tip = props.history.tip;
    setLoading(true);
    setError("");
    try {
      const scope = props.scope;
      const remoteTip = props.history.sync.remote_tip;
      const page = filtered() ? await git.getFilteredCommitPage(tip, remoteTip, scope, appliedFilter(), commits().length)
        : scope === "all" ? await git.getCommitPage(tip, commits().length)
        : remoteTip ? await git.getSyncCommitPage(tip, remoteTip, scope, commits().length) : { commits: [], has_more: false };
      if (request !== generation) return;
      setCommits(previous => [...previous, ...page.commits]);
      if (!selectedCommit()) setSelectedCommit(page.commits[0]);
      setHasMore(page.has_more);
    } catch (e) { if (request === generation) setError(String(e)); }
    finally { if (request === generation) setLoading(false); }
  }
  createEffect(() => {
    const nearBottom = scrollTop() + height() >= headerHeight() + displayedCommits().length * ROW_HEIGHT - height();
    if (!debouncing() && nearBottom && hasMore() && !loading() && !error() && !props.disabled) untrack(() => void loadMore());
  });

  const graph = createMemo(() => buildCommitGraph(displayedCommits()));
  const start = createMemo(() => Math.max(0, Math.floor(Math.max(0, scrollTop() - headerHeight()) / ROW_HEIGHT) - Math.ceil(height() / ROW_HEIGHT)));
  const end = createMemo(() => Math.min(displayedCommits().length, start() + Math.ceil(height() / ROW_HEIGHT) * 3 + 4));
  const visibleRows = createMemo(() => displayedCommits().slice(start(), end()).map((commit, index) => ({ commit, graph: graph().rows[start() + index] })));
  const date = (value: string) => new Date(value).toLocaleString(locale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  async function runAction(operation: () => Promise<History>) {
    if (props.disabled) throw new Error(t("hist01"));
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
      setCopyStatus(t("hist02"));
    } catch (e) { reportTerminalError(t("hist03", { p1: String(e) }), t("hist04")); }
  }

  return (
    <Resizable layoutId="history.table" orientation="vertical" initialSizes={[0.55, 0.45]} class="min-h-0 min-w-0 overflow-hidden">
      <ResizablePanel minSize={0.2} class="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <Show when={debouncing() || (filtered() && loading())}><span role="status" class="sr-only">{t("find07")}</span></Show>
      <Table class="min-w-[850px] table-fixed border-separate border-spacing-0 font-sans text-[13px] font-normal leading-5" aria-label={t("app05")}
        containerProps={{
          ref: element => { viewport = element; },
          onScroll: () => setScrollTop(viewport.scrollTop),
          class: "min-h-0 flex-1 bg-background [overflow-anchor:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tabindex: 0,
          "aria-label": t("hist05"),
          "aria-busy": loading() || debouncing(),
        }}>
        <colgroup><col style={{ width: `${graph().width}px` }} /><col /><col class="w-[110px]" /><col class="w-40" /><col class="w-[150px]" /></colgroup>
        <TableHeader ref={element => { header = element; }} class="sticky top-0 z-10 bg-background" onKeyDown={event => {
          if (matchesShortcut("dismiss", event) && searchOpen()) {
            event.preventDefault(); setSearchOpen(false); searchButton.focus();
          }
        }}>
          <TableRow class="hover:bg-transparent">
            <For each={[t("hist06"), t("hist07"), t("hist08"), t("hist09"), t("hist10")]}>{(heading, index) =>
              <TableHead scope="col" class="h-[34px] border-b">
                <Show when={index() === 1} fallback={heading}>
                  <div class="flex items-center justify-between gap-2"><span>{heading}</span>
                    <Button ref={element => { searchButton = element; }} size="icon" variant={searchOpen() || filtered() ? "secondary" : "ghost"} class="size-6 shrink-0"
                      aria-label={searchOpen() ? t("find13") : t("find01")} title={searchOpen() ? t("find13") : t("find01")}
                      aria-expanded={searchOpen()} aria-controls={`${searchId}-fields ${searchId}-path`} onClick={() => setSearchOpen(open => !open)}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
                    </Button>
                  </div>
                </Show>
              </TableHead>
            }</For>
          </TableRow>
          <Show when={searchOpen()}><HistoryFilters id={searchId} filter={filter()} onChange={setFilter} disabled={props.disabled} /></Show>
        </TableHeader>
        <TableBody>
          <Show when={start() > 0}><TableRow aria-hidden="true" class="border-0 hover:bg-transparent"><TableCell colspan="5" class="p-0" style={{ height: `${start() * ROW_HEIGHT}px` }} /></TableRow></Show>
          <For each={visibleRows()}>{row =>
            <ContextMenu>
            <ContextMenuTrigger as={TableRow} disabled={props.disabled || row.commit.uncommitted}
              data-state={selectedCommit()?.hash === row.commit.hash ? "selected" : undefined}
              aria-selected={selectedCommit()?.hash === row.commit.hash} tabindex={props.disabled ? -1 : 0}
              onClick={() => { if (!props.disabled) setSelectedCommit(row.commit); }}
              onKeyDown={event => { if (!props.disabled && event.target === event.currentTarget && matchesShortcut("selectCommit", event)) { event.preventDefault(); setSelectedCommit(row.commit); } }}
              class="data-[state=selected]:bg-primary/10 data-[state=selected]:hover:bg-primary/20 data-[state=selected]:[&>td:first-child]:border-l-primary [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring h-[34px] [&>td]:h-[34px] [&>td]:overflow-hidden [&>td]:text-ellipsis [&>td]:whitespace-nowrap [&>td]:border-b [&>td]:py-0">
              <TableCell class="px-0">
                <svg class={row.commit.uncommitted ? "block opacity-40" : "block"} width={graph().width} height={ROW_HEIGHT - 1} viewBox={`0 0 ${graph().width} ${ROW_HEIGHT}`} aria-label={t("hist11", { p1: row.commit.parents.length })}>
                  <For each={row.graph.edges}>{edge =>
                    <path d={`M ${12 + edge.from * 16} ${edge.top ? 0 : 17} L ${12 + edge.to * 16} ${edge.bottom ? 34 : 17}`} fill="none" stroke={`hsl(${(edge.from * 67 + 220) % 360} 55% 55%)`} stroke-width="1.5" />
                  }</For>
                  <circle cx={12 + row.graph.column * 16} cy="17" r="3.5" fill="hsl(var(--primary))" stroke="hsl(var(--background))" stroke-width="1" />
                </svg>
              </TableCell>
              <TableCell><CommitDescription subject={row.commit.subject} references={row.commit.refs} bold={row.commit.uncommitted} /></TableCell>
              <TableCell>
                <Show when={!row.commit.uncommitted} fallback={<span aria-label={t("cf02")}>*</span>}>
                <Tooltip openDelay={350}>
                  <TooltipTrigger class="rounded-sm font-sans text-[13px] font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("hist12", { p1: row.commit.hash })}>
                    {row.commit.hash.slice(0, 8)}
                  </TooltipTrigger>
                  <TooltipContent class="max-w-[90vw] break-all font-mono text-xs">{row.commit.hash}</TooltipContent>
                </Tooltip>
                </Show>
              </TableCell>
              <TableCell title={row.commit.author}>{row.commit.author}</TableCell>
              <TableCell><Show when={row.commit.date} fallback="—"><time dateTime={row.commit.date} title={row.commit.date}>{date(row.commit.date)}</time></Show></TableCell>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem disabled={props.disabled} onSelect={() => void saveCommitHash(row.commit)}>{t("hist13")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled} onSelect={() => void checkout(row.commit)}>{t("hist14")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled || !props.history.current_branch} onSelect={() => setDialogAction({ kind: "reset", commit: row.commit })}>{t("act03")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled} onSelect={() => setDialogAction({ kind: "branch", commit: row.commit })}>{t("act01")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled || !props.history.current_branch || props.history.has_changes || Boolean(props.history.operation)} title={props.history.has_changes ? t("op17") : undefined} onSelect={() => setEditAction({ kind: "cherry_pick", commit: row.commit, head: props.history.tip, branch: props.history.current_branch })}>{t("op01")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled || !props.history.current_branch || props.history.has_changes || Boolean(props.history.operation)} title={props.history.has_changes ? t("op17") : undefined} onSelect={() => setEditAction({ kind: "revert", commit: row.commit, head: props.history.tip, branch: props.history.current_branch })}>{t("op02")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled || !props.history.current_branch || row.commit.hash !== props.history.tip || Boolean(props.history.operation)} title={t("op14")}
                onSelect={() => setEditAction({ kind: "amend", commit: row.commit, head: props.history.tip, branch: props.history.current_branch })}>{t("op03")}</ContextMenuItem>
              <ContextMenuItem disabled={props.disabled} onSelect={() => setDialogAction({ kind: "tag", commit: row.commit })}>{t("act02")}</ContextMenuItem>
            </ContextMenuContent>
            </ContextMenu>
          }</For>
          <Show when={end() < displayedCommits().length}><TableRow aria-hidden="true" class="border-0 hover:bg-transparent"><TableCell colspan="5" class="p-0" style={{ height: `${(displayedCommits().length - end()) * ROW_HEIGHT}px` }} /></TableRow></Show>
          <Show when={!loading() && !debouncing() && !error() && !displayedCommits().length}><TableRow><TableCell colspan="5" class="h-24 text-center text-muted-foreground">{filtered() ? t("find06") : props.scope === "incoming" ? t("sync10") : props.scope === "outgoing" ? t("sync11") : t("hist15")}</TableCell></TableRow></Show>
        </TableBody>
      </Table>
      <span role="status" class="sr-only">{copyStatus()}</span>
      <Show when={loading()}><span role="status" class="sr-only">{t("hist16")}</span></Show>
      <Show when={error()}><Button variant="link" size="sm" class="shrink-0 self-start" onClick={() => { setHasMore(true); void loadMore(); }} disabled={props.disabled}>{t("hist17")}</Button></Show>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t("hist18")} />
      <ResizablePanel minSize={0.2} class="min-h-0 min-w-0 overflow-hidden">
        <Show when={selectedCommit()} fallback={<p class="p-4 text-sm text-muted-foreground">{t("hist19")}</p>}>{commit => <Show when={commit().uncommitted} fallback={<CommitFiles commit={commit()} disabled={props.disabled} />}>
          <WorktreeCommit history={props.history} disabled={props.disabled} onBusyChange={props.onBusyChange} />
        </Show>}</Show>
      </ResizablePanel>
      <CommitEditDialog action={editAction()} onClose={() => setEditAction(undefined)} onExecute={(head, branch, operation) => runAction(() => git.commitOperation(head, branch, operation))} />
      <CommitActionsDialog action={dialogAction()} branch={props.history.current_branch} head={props.history.tip} disabled={props.disabled} hasChanges={props.history.has_changes} onClose={() => setDialogAction(undefined)}
        onReset={(commit, mode, confirmed, head, branch) => runAction(() => git.resetToCommit(commit, mode, confirmed, head, branch))}
        onBranch={(name, commit) => runAction(() => git.createBranchAtCommit(name, commit))}
        onTag={(name, commit) => runAction(() => git.createTagAtCommit(name, commit))} />
    </Resizable>
  );
}
