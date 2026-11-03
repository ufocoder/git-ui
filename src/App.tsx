import ReferenceActionDialog, { type ReferenceAction } from "~/components/sections/reference-action-dialog";
import KeyboardShortcutsDialog from "~/components/sections/keyboard-shortcuts-dialog";
import { matchesShortcut } from "~/lib/keyboard-shortcuts";
import { Button } from "~/components/ui/button";
import GitSettingsDialog from "~/components/sections/git-settings-dialog";
import UpdateDialog from "~/components/sections/update-dialog";
import { operationNotice, dismissOperation } from "~/lib/operation-feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { t } from "~/lib/i18n";
import { Show, batch, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { git, type History, type RepositoryMode, type CommitOperation, type HistoryScope, type StashAction, type SyncAction } from "~/lib/git";
import { terminalError, clearTerminalError } from "~/lib/terminal";
import TerminalPanel from "~/components/sections/terminal-panel";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarProvider } from "~/components/ui/sidebar";
import RepositorySidebar from "~/components/sections/repository-sidebar";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";

import InitializeRepositoryDialog from "~/components/sections/initialize-repository-dialog";
import ProjectSwitcherDialog from "~/components/sections/project-switcher-dialog";
import GitRequirement, { type GitCheckState } from "~/components/sections/git-requirement";
import ProjectChooser from "~/components/sections/project-chooser";
import BranchTrackingDialog, { type TrackingMode } from "~/components/sections/branch-tracking-dialog";
import CommitOperationBar from "~/components/sections/commit-operation-bar";
import RepositoryToolbar from "~/components/sections/repository-toolbar";
import CreateBranchDialog from "~/components/sections/create-branch-dialog";
import RepositoryContent from "~/components/sections/repository-content";

function App() {
  const [isHistory, setIsHistory] = createSignal(new URLSearchParams(window.location.search).get("view") === "history");
  const [updatesOpen, setUpdatesOpen] = createSignal(new URLSearchParams(window.location.search).get("view") === "updates");
  const [installingUpdate, setInstallingUpdate] = createSignal(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let unlistenUpdates: UnlistenFn | undefined;
  let unlistenShortcuts: UnlistenFn | undefined;
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  let disposed = false;
  onCleanup(() => { disposed = true; unlistenUpdates?.(); unlistenShortcuts?.(); });
  const [gitCheck, setGitCheck] = createSignal<GitCheckState>(isTauri() ? "checking" : "ready");
  const [gitPlatform, setGitPlatform] = createSignal("");
  const [choosingProject, setChoosingProject] = createSignal(false);
  const [historyBranch, setHistoryBranch] = createSignal("all");
  const [historyScope, setHistoryScope] = createSignal<HistoryScope>("all");
  const [repositoryMode, setRepositoryMode] = createSignal<RepositoryMode>("history");
  const [terminalOpen, setTerminalOpen] = createSignal(false);
  const [error, setError] = createSignal("");
  const [history, setHistory] = createSignal<History>();
  createEffect(() => {
    const project = history(), selected = historyBranch();
    if (project && selected !== "all" && selected !== "current" && !project.branch_tips?.[selected] && !project.branches.some(name => `refs/heads/${name}` === selected)) setHistoryBranch("all");
  });
  const [initializePath, setInitializePath] = createSignal("");
  const [initializeError, setInitializeError] = createSignal("");
  const [recentProjects, setRecentProjects] = createSignal<string[]>([]);
  const [branchDialogOpen, setBranchDialogOpen] = createSignal(false);
  const [branchName, setBranchName] = createSignal("");
  const [branchError, setBranchError] = createSignal("");
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [trackingMode, setTrackingMode] = createSignal<TrackingMode>();
  const [syncAction, setSyncAction] = createSignal<SyncAction | null>(null);
  createEffect(() => {
    if (isHistory() && terminalError()) setTerminalOpen(true);
  });

  let previousConflicts = new Set<string>();
  createEffect(() => {
    const paths = new Set((history()?.conflicts ?? []).map(file => file.path));
    if ([...paths].some(path => !previousConflicts.has(path))) setRepositoryMode("conflicts");
    previousConflicts = paths;
  });
  function changeRepositoryMode(mode: RepositoryMode) {
    if (mode === "conflicts" && !history()?.conflicts.length) return;
    if (mode === "stash" && !history()?.stashes.length) return;
    setRepositoryMode(mode);
    if (mode === "conflicts" || mode === "commit" || mode === "stash") void refreshHistory();
  }

  let syncBranch = "";
  createEffect(() => {
    const project = history();
    const branch = `${project?.current_branch ?? ""}:${project?.sync.upstream ?? ""}`;
    if (branch !== syncBranch) { syncBranch = branch; setHistoryScope("all"); }
  });

  onMount(() => {
    const refreshShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut("help", event)) {
        event.preventDefault();
        if (!installingUpdate()) setShortcutsOpen(true);
        return;
      }
      if (!isHistory() || !matchesShortcut("refresh", event)) return;
      event.preventDefault();
      if (!event.repeat && !busy() && !installingUpdate()) void refreshHistory();
    };
    window.addEventListener("keydown", refreshShortcut, { capture: true });
    onCleanup(() => window.removeEventListener("keydown", refreshShortcut, { capture: true }));
  });

  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let nativeUnlisten: UnlistenFn | undefined;
    const flush = () => {
      if (!pending || busy() || !isHistory() || document.visibilityState === "hidden") return;
      pending = false;
      void refreshHistory();
    };
    const schedule = () => {
      if (!isHistory()) return;
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

  onMount(async () => {
    setBusy(true);
    try {
      if (isTauri()) {
        const unlisten = await listen("check-updates", () => setUpdatesOpen(true));
        if (disposed) { unlisten(); return; }
        unlistenUpdates = unlisten;
        const unlistenHelp = await listen("keyboard-shortcuts", () => {
          if (!installingUpdate()) setShortcutsOpen(true);
        });
        if (disposed) { unlistenHelp(); return; }
        unlistenShortcuts = unlistenHelp;
      }
      if (isHistory()) setHistory(await git.getHistory());
      else if (isTauri()) await checkGitInstallation();
    } catch (failure) {
      if (isHistory()) setError(String(failure));
      else setRecentProjects([]);
    } finally { setBusy(false); }
  });

  async function checkGitInstallation() {
    setGitCheck("checking");
    try {
      const result = await git.checkInstallation();
      if (disposed) return;
      setGitPlatform(result.platform);
      setGitCheck(result.available ? "ready" : "missing");
      if (result.available) {
        try { setRecentProjects(await git.getRecentProjects()); }
        catch { setRecentProjects([]); }
      }
    } catch { if (!disposed) setGitCheck("error"); }
  }
  async function retryGitCheck() {
    if (busy()) return;
    setBusy(true);
    try { await checkGitInstallation(); }
    finally { setBusy(false); }
  }

  function clearProjectFeedback() {
    clearTerminalError();
    const notice = operationNotice();
    if (notice) dismissOperation(notice.id);
  }
  function changeProject() {
    if (busy()) return;
    setError(""); setProjectSwitcherOpen(true);
  }

  async function selectProject() {
    if (busy() || (gitCheck() !== "ready" && !isHistory())) return;
    setError("");
    setBusy(true);
    try {
      setChoosingProject(true);
      let path: string | null;
      try { path = await open({ directory: true, multiple: false, title: t("app01") }); }
      finally { setChoosingProject(false); }
      if (!path) return;
      await openSelectedProject(path);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function openSelectedProject(path: string) {
    if (await git.canInitializeProject(path)) {
      setProjectSwitcherOpen(false);
      setInitializeError(""); setInitializePath(path);
      return;
    }
    const result = await git.openProject(path);
    clearProjectFeedback();
    batch(() => {
      setProjectSwitcherOpen(false); setSettingsOpen(false); setTrackingMode(undefined); setBranchDialogOpen(false);
      setHistory(result.history); setHistoryBranch("all"); setRepositoryMode("history"); setHistoryScope("all");
      setTerminalOpen(false); setIsHistory(true);
      if (!result.warning) setRecentProjects(result.recent_projects);
    });
  }

  async function initializeProject() {
    const path = initializePath();
    if (!path || busy()) return;
    setBusy(true); setInitializeError(""); setError("");
    try {
      if (await git.canInitializeProject(path)) await git.initializeProject(path);
      await openSelectedProject(path);
      setInitializePath("");
    } catch (e) { setInitializeError(String(e)); }
    finally { setBusy(false); }
  }

  async function openRecentProject(path: string) {
    if (busy() || (gitCheck() !== "ready" && !isHistory())) return;
    setBusy(true);
    setError("");
    try { await openSelectedProject(path); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function switchBranch(branch: string) {
    if (busy() || branch === history()?.current_branch) return;
    setBusy(true);
    setError("");
    try { setHistory(await git.switchBranch(branch)); }
    catch (e) {
      setError(String(e)); setTerminalOpen(true);
      try { setHistory(await git.getHistory()); } catch { /* Keep the last loaded history. */ }
    } finally { setBusy(false); }
  }

  async function syncProject(action: SyncAction) {
    if (busy()) return;
    setBusy(true); setError(""); setSyncAction(action);
    try {
      setHistory(await git.sync(action));
    } catch (e) {
      setError(String(e));
      try { setHistory(await git.getHistory()); } catch { /* Keep the loaded history. */ }
    } finally { setSyncAction(null); setBusy(false); }
  }

  function requestSync(action: SyncAction) {
    if (busy()) return;
    const project = history();
    if ((action === "push" && (!project?.remotes.length || !project.sync.upstream)) || (action === "pull" && !project?.sync.upstream)) {
      setTrackingMode(action === "push" ? "publish" : "upstream");
    } else void syncProject(action);
  }
  async function configureTracking(mode: TrackingMode, branch: string, remote: string, remoteBranch: string, url?: string) {
    if (busy()) throw new Error(t("hist01"));
    setBusy(true);
    try {
      if (mode === "publish" && url) setHistory(await git.addRemote("origin", url));
      setHistory(mode === "publish" ? await git.publishBranch(branch, remote, remoteBranch) : await git.setUpstream(branch, remote, remoteBranch));
    } catch (error) {
      try { setHistory(await git.getHistory()); } catch { /* Preserve the last available state. */ }
      throw error;
    } finally { setBusy(false); }
  }

  async function refreshHistory() {
    if (busy()) return;
    setBusy(true);
    try { setHistory(await git.getHistory()); }
    catch { /* The terminal displays refresh errors. */ }
    finally { setBusy(false); }
  }

  async function runCommitOperation(head: string, branch: string, operation: CommitOperation) {
    if (busy()) throw new Error(t("hist01"));
    setBusy(true);
    try { setHistory(await git.commitOperation(head, branch, operation)); }
    catch (error) {
      try { setHistory(await git.getHistory()); } catch { /* Preserve the last available state. */ }
      throw error;
    } finally { setBusy(false); }
  }

  async function runStash(action: StashAction) {
    if (busy()) throw new Error(t("hist01"));
    setBusy(true);
    try {
      const updated = await git.stash(action);
      batch(() => {
        setHistory(updated);
        if (updated.conflicts.length) setRepositoryMode("conflicts");
        else if ((action.kind === "apply" && !updated.stashes.some(entry => entry.id !== action.id))
          || (repositoryMode() === "stash" && !updated.stashes.length)) setRepositoryMode("commit");
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
    if (busy()) throw new Error(t("hist01"));
    setBusy(true);
    try { setHistory(await git.pushTags(remote, tag)); }
    catch (error) { setTerminalOpen(true); throw error; }
    finally { setBusy(false); }
  }

  const [referenceAction, setReferenceAction] = createSignal<ReferenceAction>();
  async function changeReference(action: ReferenceAction, name: string | null) {
    if (busy()) throw new Error(t("hist01"));
    setBusy(true);
    try { setHistory(await git.changeReference(action.kind, action.name, name)); }
    catch (error) { setTerminalOpen(true); throw error; }
    finally { setBusy(false); }
  }

  async function deleteTag(tag: string, remote: string | null) {
    if (busy()) throw new Error(t("hist01"));
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
    if (!name) { setBranchError(t("app03")); return; }
    setCreatingBranch(true);
    setBusy(true);
    setBranchError("");
    setError("");
    try {
      setHistory(await git.createBranch(name));
      setBranchDialogOpen(false);
      setBranchName("");
    } catch {
      setBranchDialogOpen(false);
      try { setHistory(await git.getHistory()); } catch { /* Keep the last loaded history. */ }
    } finally { setCreatingBranch(false); setBusy(false); }
  }

  return (
    <SidebarProvider open={true} onOpenChange={() => {}} class={isHistory() ? "" : "contents"}>
    <Show when={isHistory() && history()}>{project => { const initial = project(); return <RepositorySidebar onSettings={() => setSettingsOpen(true)} history={history() ?? initial} mode={repositoryMode()} onModeChange={changeRepositoryMode} onChangeProject={changeProject} projectMenuOpen={projectSwitcherOpen()} disabled={busy()} onSwitchBranch={branch => void switchBranch(branch)}
      onCreateBranch={() => { setBranchName(""); setBranchError(""); setBranchDialogOpen(true); }}
      onReferenceAction={setReferenceAction} onPushBranch={() => requestSync("push")} onCreateTag={createTag} onPushTags={pushTags} onDeleteTag={deleteTag} onAddRemote={addRemote} />; }}</Show>
    <ReferenceActionDialog action={referenceAction()} busy={busy()} onClose={() => setReferenceAction(undefined)} onExecute={changeReference} />
    <main class={isHistory() ? "flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "flex min-h-dvh w-full flex-col items-center justify-center gap-6 p-6"}>
      <Show when={isHistory()} fallback={
        <ProjectChooser choosingProject={choosingProject()} busy={busy()} recentProjects={recentProjects()}
          ready={gitCheck() === "ready"} requirement={<GitRequirement state={gitCheck()} platform={gitPlatform()} onRetry={() => void retryGitCheck()} />}
          onSelectProject={() => void selectProject()} onOpenRecent={path => void openRecentProject(path)} />
      }>
        <RepositoryToolbar historyBranch={historyBranch()} onHistoryBranchChange={setHistoryBranch} onStashAll={() => { void runStash({ kind: "save", message: "", include_untracked: true }).catch(() => setTerminalOpen(true)); }} mode={repositoryMode()} busy={busy()} history={history()} action={syncAction()} onSync={requestSync} onConfigureUpstream={() => setTrackingMode("upstream")} terminalOpen={terminalOpen()} onToggleTerminal={() => setTerminalOpen(value => !value)} />
        <Show when={history()?.operation}>{operation => <Show when={repositoryMode() === "commit" || repositoryMode() === "conflicts"} fallback={
          <div class="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2" role="status">
            <p class="text-xs text-muted-foreground">{t("op21", { kind: operation().kind, sha: operation().commit.slice(0, 8) })}</p>
            <Button size="sm" variant="ghost" disabled={busy()} onClick={() => changeRepositoryMode(operation().conflicts ? "conflicts" : "commit")}>{t("ui02")}</Button>
          </div>
        }>
          <CommitOperationBar history={history()!} disabled={busy()} onShowConflicts={repositoryMode() === "conflicts" ? undefined : () => changeRepositoryMode("conflicts")} onExecute={runCommitOperation} />
        </Show>}</Show>
        <BranchTrackingDialog mode={trackingMode()} history={history()} busy={busy()} onClose={() => setTrackingMode(undefined)} onSubmit={configureTracking} />
        <CreateBranchDialog open={branchDialogOpen()} pending={creatingBranch()} name={branchName()} error={branchError()}
          onOpenChange={value => {
            if (creatingBranch()) return;
            if (value) { setBranchName(""); setBranchError(""); }
            setBranchDialogOpen(value);
          }}
          onNameChange={value => { setBranchName(value); setBranchError(""); }}
          onSubmit={event => void createBranch(event)} />
        <Show when={busy()}><p role="status" class="sr-only">{t("app04")}</p></Show>
        <Show when={history()} fallback={<Show when={terminalOpen()}><section class="min-h-0 flex-1"><TerminalPanel busy={busy()} /></section></Show>}>{project => { const initial = project(); return <section aria-label={t("app05")} class="min-h-0 min-w-0 flex-1">
              <Show keyed when={(history() ?? initial).path}>
              <RepositoryContent historyBranch={historyBranch()} onStash={runStash} onRefresh={refreshHistory} scope={historyScope()} mode={repositoryMode()} onModeChange={changeRepositoryMode} history={history() ?? initial} disabled={busy()} terminalOpen={terminalOpen()} onHistoryChange={setHistory} onBusyChange={setBusy} />
              </Show>
            </section>;
        }}</Show>
      </Show>
      <Show when={!isHistory() && error() && !/invoke/i.test(error())}><Alert variant="destructive" class="max-w-xl"><AlertTitle>{t("app06")}</AlertTitle><AlertDescription class="break-all">{error()}</AlertDescription></Alert></Show>
    </main>
    <Show when={isHistory()}><GitSettingsDialog hasProject open={settingsOpen()} onClose={() => setSettingsOpen(false)} /></Show>
    <Dialog open={updatesOpen()} onOpenChange={open => { if (!installingUpdate()) setUpdatesOpen(open); }}>
      <Show when={updatesOpen()}><DialogContent class="max-h-[90dvh] overflow-auto p-0 sm:max-w-lg">
        <DialogHeader class="sr-only"><DialogTitle>{t("upd02")}</DialogTitle><DialogDescription>{t("upd17")}</DialogDescription></DialogHeader>
        <UpdateDialog onClose={() => setUpdatesOpen(false)} onInstallingChange={setInstallingUpdate} />
      </DialogContent></Show>
    </Dialog>
    <ProjectSwitcherDialog open={projectSwitcherOpen()} currentPath={history()?.path ?? ""} recentProjects={recentProjects()}
      pending={busy()} choosingProject={choosingProject()} error={error()} onOpenChange={setProjectSwitcherOpen}
      onSelect={path => void openRecentProject(path)} onOpenFolder={() => void selectProject()} />
    <KeyboardShortcutsDialog open={shortcutsOpen()} onOpenChange={setShortcutsOpen} />
    <InitializeRepositoryDialog path={initializePath()} pending={busy()} error={initializeError()}
      onConfirm={() => void initializeProject()} onCancel={() => { setInitializePath(""); setInitializeError(""); }} />
    </SidebarProvider>
  );
}
export default App;
