import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { WORKTREE, type CommitFile, type DiscardPreview, type DiscardResult, type DiscardTarget, type CommitDetails, type History } from "../../lib/git-types.ts";

export type DiscardDialogOptions = {
  path: string | undefined;
  history: History;
  busy: boolean;
  onHistoryChange: (history: History) => void;
  onBusyChange: (busy: boolean) => void;
};

export function createDiscardChanges(props: DiscardDialogOptions, api: {
  getCommitDetails: (commit: string) => Promise<CommitDetails>;
  previewDiscardChanges: (paths: string[]) => Promise<DiscardPreview>;
  discardWorktreeChanges: (target: DiscardTarget) => Promise<DiscardResult>;
}) {
  const [files, setFiles] = createSignal<CommitFile[]>([]);
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  type Phase =
    | { kind: "idle" | "checking" | "pending" }
    | { kind: "ready"; preview: DiscardPreview }
    | { kind: "done"; result: DiscardResult }
    | { kind: "failed"; error: string };
  const [phase, setPhase] = createSignal<Phase>({ kind: "idle" });
  const [confirmed, setConfirmed] = createSignal(false);
  const preview = createMemo(() => { const value = phase(); return value.kind === "ready" ? value.preview : undefined; });
  const result = createMemo(() => { const value = phase(); return value.kind === "done" ? value.result : undefined; });
  const checking = () => phase().kind === "checking";
  const pending = () => phase().kind === "pending";
  const error = () => { const value = phase(); return value.kind === "failed" ? value.error : ""; };
  let generation = 0, opening = 0, mounted = true;
  onCleanup(() => { mounted = false; generation++; opening++; });
  createEffect(on(() => props.path, path => {
    const request = ++opening; generation++;
    setFiles([]); setSelected(new Set<string>()); setPhase({ kind: "idle" }); setConfirmed(false);
    if (path === undefined) return;
    const load = (entries: CommitFile[]) => {
      if (!mounted || request !== opening) return;
      setFiles(entries);
      setSelected(new Set(entries.filter(file => !path || file.path === path || file.path.startsWith(path + "/")).map(file => file.path)));
    };
    if (props.history.worktree_files) load(props.history.worktree_files);
    else void api.getCommitDetails(WORKTREE).then(details => load(details.files)).catch(failure => { if (mounted && request === opening) setPhase({ kind: "failed", error: String(failure) }); });
  }));
  const chosen = createMemo(() => files().filter(file => selected().has(file.path)).map(file => file.path));
  createEffect(() => {
    const paths = chosen(), open = props.path !== undefined, completed = Boolean(result());
    const request = ++generation;
    setConfirmed(false);
    if (completed) return;
    setPhase({ kind: "idle" });
    if (!open || !paths.length) return;
    setPhase({ kind: "checking" });
    const timer = setTimeout(() => {
      void api.previewDiscardChanges(paths).then(value => { if (mounted && request === generation) setPhase({ kind: "ready", preview: value }); })
        .catch(failure => { if (mounted && request === generation) setPhase({ kind: "failed", error: String(failure) }); });
    }, 150);
    onCleanup(() => clearTimeout(timer));
  });
  const blocked = () => !props.history.tip || props.history.git_lfs_missing || Boolean(props.history.operation) || props.history.conflicts.length > 0;
  const stale = () => Boolean(preview() && (preview()!.target.head !== props.history.tip || preview()!.target.branch !== props.history.current_branch));
  function toggle(path: string, checked: boolean) {
    const next = new Set(selected()); if (checked) next.add(path); else next.delete(path); setSelected(next);
  }
  async function submit() {
    const target = preview()?.target;
    if (!target || !confirmed() || pending() || props.busy || checking() || blocked() || stale()) return;
    setPhase({ kind: "pending" }); props.onBusyChange(true);
    try {
      const response = await api.discardWorktreeChanges(target);
      if (mounted) { setPhase({ kind: "done", result: response }); props.onHistoryChange(response.history); }
    } catch (failure) { if (mounted) { setPhase({ kind: "failed", error: String(failure) }); setConfirmed(false); } }
    finally { props.onBusyChange(false); }
  }
  return { files, selected, chosen, preview, result, confirmed, setConfirmed, checking, pending, error, blocked, stale, toggle, submit,
    selectAll: (checked: boolean) => setSelected(new Set(checked ? files().map(file => file.path) : [])),
  };
}
