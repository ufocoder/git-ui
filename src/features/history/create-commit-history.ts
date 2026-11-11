import { batch, createEffect, createMemo, createSignal, on, onCleanup, untrack, type Accessor, type Setter } from "solid-js";
import { git, createWorktreeCommit, type Commit, type History, type HistoryFilter, type HistoryScope } from "~/lib/git";
import { anchoredScroll, preservedSelection } from "~/lib/history-view";

export function createCommitHistory(props: {
  history: Accessor<History>;
  branch: Accessor<string>;
  scope: Accessor<HistoryScope>;
  disabled: Accessor<boolean>;
  filter: Accessor<HistoryFilter>;
  jumpRef: Accessor<string>;
  rowHeight: number;
  headerHeight: Accessor<number>;
  height: Accessor<number>;
  scrollTop: Accessor<number>;
  readScrollPosition: () => number;
  setScrollPosition: (top: number) => void;
  selectedCommit: Accessor<Commit | undefined>;
  setSelectedCommit: Setter<Commit | undefined>;
  resetRange: () => void;
}) {
  const { filter, jumpRef, scrollTop, headerHeight, height, selectedCommit, setSelectedCommit } = props;
  let generation = 0;
  const [appliedFilter, setAppliedFilter] = createSignal<HistoryFilter>(untrack(filter));
  const [debouncing, setDebouncing] = createSignal(false);
  const filtered = createMemo(() => Boolean(appliedFilter().text.trim() || appliedFilter().sha.trim() || appliedFilter().author.trim() || appliedFilter().file));
  createEffect(on(filter, value => {
    generation++; setDebouncing(true); setLoading(false);
    const timer = window.setTimeout(() => { setAppliedFilter({ text: value.text.trim(), sha: value.sha.trim(), author: value.author.trim(), file: value.file }); setDebouncing(false); }, 250);
    onCleanup(() => window.clearTimeout(timer));
  }, { defer: true }));
  const [commits, setCommits] = createSignal<Commit[]>([]);
  const [graphRevision, setGraphRevision] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const referenceTip = (ref: string) => ref.startsWith("refs/tags/") ? props.history().tag_tips?.[ref.slice(10)] : props.history().branch_tips?.[ref];
  const jumpTip = () => referenceTip(jumpRef());
  const allBranches = () => props.branch() === "all" && !jumpTip();
  const historyTips = () => {
    const tips = props.history().branch_tips;
    return tips && Object.values(tips);
  };
  const viewingHead = () => !jumpTip() && (allBranches() || props.branch() === "current" || props.branch() === `refs/heads/${props.history().current_branch}`);
  const selectedTip = () => jumpTip() ?? (allBranches() || props.branch() === "current" ? props.history().tip : props.history().branch_tips?.[props.branch()] ?? (viewingHead() ? props.history().tip : ""));
  const worktreeCommit = createMemo(() => createWorktreeCommit(props.history().tip));
  const displayedCommits = createMemo(() => props.scope() === "all" && viewingHead() && !filtered() && props.history().has_changes ? [worktreeCommit(), ...commits()] : commits());
  function readPage(
    history: History,
    scope: HistoryScope,
    tip: string,
    filter: HistoryFilter | undefined,
    includeBranches: boolean,
    tips: string[] | undefined,
    offset: number,
  ) {
    const remoteTip = history.sync.remote_tip;
    if (filter) return git.getFilteredCommitPage(tip, remoteTip, scope, filter, offset, includeBranches, tips);
    if (scope === "all") return git.getCommitPage(tip, offset, includeBranches, tips);
    return remoteTip
      ? git.getSyncCommitPage(history.tip, remoteTip, scope, offset)
      : Promise.resolve({ commits: [], has_more: false });
  }

  let previousContext = "";
  createEffect(() => {
    const history = props.history();
    const scope = props.scope();
    const tip = selectedTip(), includeBranches = allBranches(), showWorktree = viewingHead();
    const search = appliedFilter();
    const hasFilter = filtered();
    const tips = historyTips();
    const context = JSON.stringify([history.path, history.current_branch, props.branch(), scope, search, jumpRef()]);
    const preserve = previousContext === context;
    previousContext = context;
    const previous = untrack(selectedCommit);
    const previousRows = untrack(displayedCommits);
    const previousCount = untrack(commits).length;
    const top = untrack(props.readScrollPosition);
    const anchorIndex = Math.floor(Math.max(0, top - untrack(headerHeight)) / props.rowHeight);
    const anchor = previousRows[anchorIndex]?.hash;
    const offset = top - anchorIndex * props.rowHeight;
    const request = ++generation;
    props.resetRange();
    setError(""); setLoading(true);
    if (!preserve) {
      props.setScrollPosition(0);
      setSelectedCommit(undefined);
    }
    const pageAt = (offset: number) => readPage(history, scope, tip, hasFilter ? search : undefined, includeBranches, tips, offset);
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
        const restored = preserve ? anchoredScroll(rows, anchor, offset, top, props.rowHeight) : 0;
        queueMicrotask(() => {
          if (request === generation) props.setScrollPosition(restored);
        });
      } catch (failure) { if (request === generation) setError(String(failure)); }
      finally { if (request === generation) setLoading(false); }
    })();
  });
  onCleanup(() => { generation++; });

  async function loadMore() {
    if (debouncing() || loading() || !hasMore() || props.disabled()) return;
    const request = generation;
    const tip = selectedTip();
    setLoading(true);
    setError("");
    try {
      const page = await readPage(
        props.history(), props.scope(), tip, filtered() ? appliedFilter() : undefined,
        allBranches(), historyTips(), commits().length,
      );
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
    const nearBottom = scrollTop() + height() >= headerHeight() + displayedCommits().length * props.rowHeight - height();
    if (!debouncing() && nearBottom && hasMore() && !loading() && !error() && !props.disabled()) untrack(() => void loadMore());
  });

  function retry() {
    setHasMore(true);
    void loadMore();
  }
  return {
    referenceTip, jumpTip, filtered, debouncing, loading, error, setError, hasMore,
    displayedCommits, graphRevision, loadMore, retry, generation: () => generation,
    resetContext: () => { previousContext = ""; },
  };
}
