import type { RewriteRecovery } from "~/lib/git";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { createRepositorySync } from "~/features/sync/repository-sync";
import { modeAfterStash } from "~/features/stash/stash-mode";
import { createCommitFlow, matchesPushTarget, type CommitFlowState, type CommitRequest } from "~/features/changes/commit-flow";
import OperationStatus from "~/components/sections/operation-status";
import { getCurrentWindow } from "@tauri-apps/api/window";
import BranchActionDialog, { type BranchAction } from "~/components/sections/branch-action-dialog";
import type { BranchActionPreview, BranchRemoteTarget } from "~/lib/git";
import ReferenceActionDialog, { type ReferenceAction } from "~/components/sections/reference-action-dialog";
import { matchesShortcut } from "~/lib/keyboard-shortcuts";
import { Button } from "~/components/ui/button";
import { t } from "~/lib/i18n";
import { Show, batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { git, pushCommittedBranch, type History, type RepositoryMode, type CommitOperation, type StashAction } from "~/lib/git";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import RepositorySidebar from "~/components/sections/repository-sidebar";
import BranchTrackingDialog from "~/features/sync/branch-tracking-dialog";
import CommitOperationBar from "~/components/sections/commit-operation-bar";
import RepositoryToolbar from "~/components/sections/repository-toolbar";
import CreateBranchDialog from "~/components/sections/create-branch-dialog";
import RepositoryContent from "./repository-content";
import { terminalError, reportTerminalError } from "~/lib/terminal";

export default function RepositoryWorkspace(props: {
  initialHistory: History;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  installingUpdate: boolean;
  projectMenuOpen: boolean;
  onChangeProject: () => void;
  onSettings: () => void;
}) {
  const busy = () => props.busy;
  const setBusy = props.onBusyChange;
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const [historyBranch, setHistoryBranch] = createSignal("all");
  const [stashListMount, setStashListMount] = createSignal<HTMLDivElement>();
  const [stashActionsMount, setStashActionsMount] = createSignal<HTMLDivElement>();
  const [repositoryMode, setRepositoryMode] = createSignal<RepositoryMode>("history");
  const [terminalOpen, setTerminalOpen] = createSignal(false);
  const [history, setHistory] = createSignal(props.initialHistory);
  const windowTitle = createMemo(() => {
    const project = history();
    const name = project.path.split(/[\\/]/).filter(Boolean).pop() ?? project.path;
    return `${name} (${project.current_branch || "HEAD"})`;
  });
  createEffect(() => {
    const title = windowTitle();
    if (isTauri()) void getCurrentWindow().setTitle(title).catch(error => console.error(error));
  });

  createEffect(() => {
    const project = history(), selected = historyBranch();
    if (selected !== "all" && selected !== "current" && !project.branch_tips?.[selected] && !project.branches.some(name => `refs/heads/${name}` === selected)) setHistoryBranch("all");
  });
  const [branchDialogOpen, setBranchDialogOpen] = createSignal(false);
  const [branchName, setBranchName] = createSignal("");
  const [branchError, setBranchError] = createSignal("");
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [commitFlowState, setCommitFlowState] = createSignal<CommitFlowState>({ kind: "idle" });
  const failedCommitPush = createMemo(() => {
    const state = commitFlowState();
    return state.kind === "pushFailed" ? state.target : undefined;
  });
  const commitFlow = createCommitFlow({
    commit: request => request.amend
      ? git.commitOperation(request.amend.head, request.amend.branch, {
          kind: "amend", commit: request.amend.head, message: request.message, confirmed: request.amend.confirmed,
        }, request.options)
      : git.commitChanges(request.message, request.options),
    push: pushCommittedBranch,
    readHistory: git.getHistory,
  }, state => {
    if (disposed) return;
    setCommitFlowState(state);
    if (state.kind === "pushFailed") reportTerminalError(t("commit.push-error", { p1: String(state.error) }), t("command.push"));
  });

  async function submitCommit(request: CommitRequest) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try { return await commitFlow.submit(request); }
    finally { setBusy(false); }
  }

  const sync = createRepositorySync(git, {
    history, busy, setBusy, setHistory,
    onPushCompleted(updated) {
      const failed = failedCommitPush();
      if (failed && matchesPushTarget(updated, failed)) commitFlow.dismiss();
    },
  });
  const canRestore = (target: RewriteRecovery) => !busy() && history().tip === target.head && history().current_branch === target.branch
    && !history().has_changes && !history().operation;
  async function restoreHistory(target: RewriteRecovery) {
    if (!canRestore(target)) return;
    setBusy(true);
    try { setHistory(await git.restoreRewrittenHistory(target.head, target.branch)); }
    catch { /* The terminal reports failures. */ }
    finally { setBusy(false); }
  }

  const [retryingPush, setRetryingPush] = createSignal(false);
  const syncAction = () => retryingPush() ? "push" : sync.action();
  createEffect(() => {
    if (terminalError()) setTerminalOpen(true);
  });

  let previousConflicts = new Set<string>();
  createEffect(() => {
    const paths = new Set((history().conflicts ?? []).map(file => file.path));
    if ([...paths].some(path => !previousConflicts.has(path))) setRepositoryMode("conflicts");
    previousConflicts = paths;
  });
  createEffect(() => {
    const project = history();
    if (project && !project.has_changes && repositoryMode() === "commit") setRepositoryMode("history");
  });
  function changeRepositoryMode(mode: RepositoryMode) {
    if (mode === "commit" && !history().has_changes) return;
    if (mode === "conflicts" && !history().conflicts.length) return;
    if (mode === "stash" && !history().stashes.length) return;
    setRepositoryMode(mode);
    if (mode === "conflicts" || mode === "commit" || mode === "stash") void refreshHistory();
  }

  onMount(() => {
    const refreshShortcut = (event: KeyboardEvent) => {
      if (!matchesShortcut("refresh", event)) return;
      event.preventDefault();
      if (!event.repeat && !busy() && !props.installingUpdate) void refreshHistory();
    };
    window.addEventListener("keydown", refreshShortcut, { capture: true });
    onCleanup(() => window.removeEventListener("keydown", refreshShortcut, { capture: true }));
  });

  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let nativeUnlisten: UnlistenFn | undefined;
    const flush = () => {
      if (!pending || busy() || document.visibilityState === "hidden") return;
      pending = false;
      void refreshHistory();
    };
    const schedule = () => {
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    };
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", schedule);
    createEffect(() => { if (!busy() && pending) { clearTimeout(timer); timer = setTimeout(flush, 400); } });
    if (isTauri()) void listen("tauri://focus", schedule).then(unlisten => {
      if (disposed) unlisten(); else nativeUnlisten = unlisten;
    }).catch(() => { /* DOM focus remains available. */ });
    onCleanup(() => {
      clearTimeout(timer); nativeUnlisten?.();
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", schedule);
    });
  });

  async function switchBranch(branch: string) {
    if (busy() || branch === history().current_branch) return;
    setBusy(true);
    try { setHistory(await git.switchBranch(branch)); }
    catch {
      setTerminalOpen(true);
      try { setHistory(await git.getHistory()); } catch { /* Keep the last loaded history. */ }
    } finally { setBusy(false); }
  }

  async function retryCommitPush() {
    const target = failedCommitPush();
    if (!target || busy() || !matchesPushTarget(history(), target)) return;
    setBusy(true);
    setRetryingPush(true);
    try {
      const latest = await commitFlow.retry();
      if (latest && !disposed) setHistory(latest);
    } catch {
      setTerminalOpen(true);
    } finally {
      setRetryingPush(false);
      setBusy(false);
    }
  }

  async function refreshHistory() {
    if (busy()) return;
    setBusy(true);
    try { setHistory(await git.getHistory()); }
    catch { /* The terminal displays refresh errors. */ }
    finally { setBusy(false); }
  }

  async function runCommitOperation(head: string, branch: string, operation: CommitOperation) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try { setHistory(await git.commitOperation(head, branch, operation)); }
    catch (error) {
      try { setHistory(await git.getHistory()); } catch { /* Preserve the last available state. */ }
      throw error;
    } finally { setBusy(false); }
  }

  async function runStash(action: StashAction) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try {
      const updated = await git.stash(action);
      batch(() => {
        setHistory(updated);
        setRepositoryMode(mode => modeAfterStash(action, updated, mode));
      });
    }
    catch (error) {
      try { setHistory(await git.getHistory()); } catch { /* Preserve the last available state. */ }
      throw error;
    } finally { setBusy(false); }
  }

  async function createTag(name: string) {
    setBusy(true);
    try { setHistory(await git.createTag(name)); }
    finally { setBusy(false); }
  }

  async function pushTags(remote: string, tag: string | null) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try { setHistory(await git.pushTags(remote, tag)); }
    catch (error) { setTerminalOpen(true); throw error; }
    finally { setBusy(false); }
  }

  const [branchAction, setBranchAction] = createSignal<BranchAction>();
  async function executeBranchAction(action: BranchAction, preview: BranchActionPreview, remote: BranchRemoteTarget | null) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try { setHistory(await git.executeBranchAction(action.kind, preview, remote)); }
    catch (error) {
      setTerminalOpen(true);
      try {
        const latest = await git.getHistory();
        setHistory(latest);
        if (action.kind === "rebase" && latest.operation?.kind === "rebase") return;
      } catch { /* Keep the last loaded history. */ }
      throw error;
    } finally { setBusy(false); }
  }

  const [referenceAction, setReferenceAction] = createSignal<ReferenceAction>();
  async function changeReference(action: ReferenceAction, name: string | null) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try { setHistory(await git.changeReference(action.kind, action.name, name)); }
    catch (error) { setTerminalOpen(true); throw error; }
    finally { setBusy(false); }
  }

  async function deleteTag(tag: string, remote: string | null) {
    if (busy()) throw new Error(t("history.busy"));
    setBusy(true);
    try { setHistory(await git.deleteTag(tag, remote)); }
    catch (error) {
      setTerminalOpen(true);
      try { setHistory(await git.getHistory()); } catch { /* Keep the last loaded history. */ }
      throw error;
    } finally { setBusy(false); }
  }

  async function addRemote(name: string, url: string) {
    setBusy(true);
    try { setHistory(await git.addRemote(name, url)); }
    finally { setBusy(false); }
  }

  async function createBranch(event: SubmitEvent) {
    event.preventDefault();
    if (busy() || creatingBranch()) return;
    const name = branchName().trim();
    if (!name) { setBranchError(t("app.branch-required")); return; }
    setCreatingBranch(true);
    setBusy(true);
    setBranchError("");
    try {
      setHistory(await git.createBranch(name));
      setBranchDialogOpen(false);
      setBranchName("");
    } catch {
      setBranchDialogOpen(false);
      try { setHistory(await git.getHistory()); } catch { /* Keep the last loaded history. */ }
    } finally { setCreatingBranch(false); setBusy(false); }
  }

  return <>
    <RepositorySidebar onStashListMount={setStashListMount} onSettings={props.onSettings} history={history()} mode={repositoryMode()} onModeChange={changeRepositoryMode} onChangeProject={props.onChangeProject} projectMenuOpen={props.projectMenuOpen} disabled={busy()} onSwitchBranch={branch => void switchBranch(branch)}
      onCreateBranch={() => { setBranchName(""); setBranchError(""); setBranchDialogOpen(true); }}
      onRebaseBranch={name => setBranchAction({ name, kind: "rebase" })} onReferenceAction={action => action.kind === "branch" && action.deleting ? setBranchAction({ name: action.name, kind: "delete" }) : setReferenceAction(action)} onPushBranch={() => sync.request("push")} onCreateTag={createTag} onPushTags={pushTags} onDeleteTag={deleteTag} onAddRemote={addRemote} />
    <BranchActionDialog action={branchAction()} busy={busy()} onClose={() => setBranchAction(undefined)} onExecute={executeBranchAction} />
    <ReferenceActionDialog action={referenceAction()} busy={busy()} onClose={() => setReferenceAction(undefined)} onExecute={changeReference} />
    <main class="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <RepositoryToolbar onStashActionsMount={setStashActionsMount} onStashAll={() => { void runStash({ kind: "save", message: "", include_untracked: true }).catch(() => setTerminalOpen(true)); }} mode={repositoryMode()} busy={busy()} history={history()} action={syncAction()} onSync={sync.request} onConfigureUpstream={() => sync.setTrackingMode("upstream")} terminalOpen={terminalOpen()} onToggleTerminal={() => setTerminalOpen(value => !value)} />
        <Show when={failedCommitPush()}>{target =>
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-warning px-4 py-2 text-warning-foreground">
            <p role="status" class="text-sm font-medium">{t("commit.push-failed")}</p>
            <div class="flex flex-wrap items-center gap-2">
              <span title={!matchesPushTarget(history(), target()) ? t("commit.target-changed") : undefined}>
                <Button size="sm" variant="outline" disabled={busy() || !matchesPushTarget(history(), target())} onClick={() => void retryCommitPush()}>{syncAction() === "push" ? t("push.running") : t("commit.retry-push")}</Button>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setTerminalOpen(true)}>{t("notice.terminal")}</Button>
              <Button size="icon" variant="ghost" class="size-7" aria-label={t("notice.dismiss")} title={t("notice.dismiss")} onClick={() => commitFlow.dismiss()}>×</Button>
            </div>
          </div>
        }</Show>
        <Show when={history()?.operation}>{operation => <Show when={repositoryMode() === "commit" || repositoryMode() === "conflicts" || !history().has_changes} fallback={
          <div class="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2" role="status">
            <p class="text-xs text-muted-foreground">{t("operation.status", { kind: operation().kind, sha: operation().commit.slice(0, 8) })}</p>
            <Button size="sm" variant="ghost" disabled={busy()} onClick={() => changeRepositoryMode(operation().conflicts ? "conflicts" : "commit")}>{t("operation.open")}</Button>
          </div>
        }>
          <CommitOperationBar history={history()} disabled={busy()} onShowConflicts={repositoryMode() === "conflicts" ? undefined : () => changeRepositoryMode("conflicts")} onExecute={runCommitOperation} />
        </Show>}</Show>
        <BranchTrackingDialog mode={sync.trackingMode()} history={history()} busy={busy()} onClose={() => sync.setTrackingMode(undefined)} onSubmit={sync.configure} />
        <CreateBranchDialog open={branchDialogOpen()} pending={creatingBranch()} name={branchName()} error={branchError()}
          onOpenChange={value => {
            if (creatingBranch()) return;
            if (value) { setBranchName(""); setBranchError(""); }
            setBranchDialogOpen(value);
          }}
          onNameChange={value => { setBranchName(value); setBranchError(""); }}
          onSubmit={event => void createBranch(event)} />
        <Show when={busy()}><p role="status" class="sr-only">{t("app.refreshing")}</p></Show>
        <section aria-label={t("app.commits")} class="min-h-0 min-w-0 flex-1">
              <RepositoryContent onSubmitCommit={submitCommit} commitPhase={commitFlowState().kind} stashListMount={stashListMount()} stashActionsMount={stashActionsMount()} historyBranch={historyBranch()} onHistoryBranchChange={setHistoryBranch} onStash={runStash} onRefresh={refreshHistory} scope="all" mode={repositoryMode()} onModeChange={changeRepositoryMode} history={history()} disabled={busy()} terminalOpen={terminalOpen()} onHistoryChange={setHistory} onBusyChange={setBusy} />
        </section>
    </main>
    <Dialog open={Boolean(sync.forceTarget())} onOpenChange={open => { if (!open) sync.setForceTarget(undefined); }}>
      <Show when={sync.forceTarget()}>{target => <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("push.lease-title")}</DialogTitle>
          <DialogDescription>{t("push.lease-description", { remote: target().remote, branch: target().reference.slice("refs/heads/".length), sha: target().expected.slice(0, 8) })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => sync.setForceTarget(undefined)}>{t("common.cancel")}</Button>
          <Button variant="destructive" disabled={busy()} onClick={() => void sync.forcePush()}>{t("push.lease-confirm")}</Button>
        </DialogFooter>
      </DialogContent>}</Show>
    </Dialog>
    <OperationStatus onOpenTerminal={() => setTerminalOpen(true)} canRestore={canRestore} onRestore={target => void restoreHistory(target)} />
  </>;
}
