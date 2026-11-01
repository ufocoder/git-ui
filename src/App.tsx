import GitSettingsDialog from "~/components/sections/git-settings-dialog";
import UpdateWindow from "~/components/sections/update-window";
import { t } from "~/lib/i18n";
import { Show, batch, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { git, type History, type RepositoryMode, type CommitOperation, type HistoryScope, type StashAction, type SyncAction } from "~/lib/git";
import { terminalError } from "~/lib/terminal";
import TerminalPanel from "~/components/sections/terminal-panel";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarProvider } from "~/components/ui/sidebar";
import RepositorySidebar from "~/components/sections/repository-sidebar";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";

import InitializeRepositoryDialog from "~/components/sections/initialize-repository-dialog";
import ProjectChooser from "~/components/sections/project-chooser";
import BranchTrackingDialog, { type TrackingMode } from "~/components/sections/branch-tracking-dialog";
import CommitOperationBar from "~/components/sections/commit-operation-bar";
import RepositoryToolbar from "~/components/sections/repository-toolbar";
import CreateBranchDialog from "~/components/sections/create-branch-dialog";
import RepositoryContent from "~/components/sections/repository-content";

function App() {
  if (new URLSearchParams(window.location.search).get("view") === "updates") return <UpdateWindow />;
  const isHistory = new URLSearchParams(window.location.search).get("view") === "history";
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [openedProjectWindow, setOpenedProjectWindow] = createSignal<string>();
  let unlistenProjectClosed: UnlistenFn | undefined;
  let disposed = false;
  let openingProjectWindow = false;
  const closedProjectWindows = new Set<string>();
  onCleanup(() => { disposed = true; unlistenProjectClosed?.(); });
  const [choosingProject, setChoosingProject] = createSignal(false);
  const [historyScope, setHistoryScope] = createSignal<HistoryScope>("all");
  const [repositoryMode, setRepositoryMode] = createSignal<RepositoryMode>("history");
  const [terminalOpen, setTerminalOpen] = createSignal(false);
  const [error, setError] = createSignal("");
  const [history, setHistory] = createSignal<History>();
  const [initializePath, setInitializePath] = createSignal("");
  const [initializeError, setInitializeError] = createSignal("");
  const [recentProjects, setRecentProjects] = createSignal<string[]>([]);
  const [branchDialogOpen, setBranchDialogOpen] = createSignal(false);
  const [branchName, setBranchName] = createSignal("");
  const [branchError, setBranchError] = createSignal("");
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [trackingMode, setTrackingMode] = createSignal<TrackingMode>();
  const [syncAction, setSyncAction] = createSignal<SyncAction | null>(null);
  const [syncStatus, setSyncStatus] = createSignal("");
  createEffect(() => {
    if (isHistory && terminalError()) setTerminalOpen(true);
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
    if (mode === "conflicts" || mode === "commit") void refreshHistory();
  }

  let syncBranch = "";
  createEffect(() => {
    const project = history();
    const branch = `${project?.current_branch ?? ""}:${project?.sync.upstream ?? ""}`;
    if (branch !== syncBranch) { syncBranch = branch; setHistoryScope("all"); }
  });

  onMount(async () => {
    if (!isHistory) {
      setBusy(true);
      try {
        if (isTauri()) {
          const unlisten = await listen<string>("project-page-closed", event => {
            if (openingProjectWindow) closedProjectWindows.add(event.payload);
            if (openedProjectWindow() === event.payload) setOpenedProjectWindow(undefined);
          });
          if (disposed) { unlisten(); return; }
          unlistenProjectClosed = unlisten;
          setRecentProjects(await git.getRecentProjects());
        }
      }
      catch { setRecentProjects([]); }
      finally { setBusy(false); }
      return;
    }
    setBusy(true);
    try { setHistory(await git.getHistory()); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  });

  async function selectProject() {
    if (busy() || openedProjectWindow()) return;
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
      setInitializeError(""); setInitializePath(path);
      return;
    }
    openingProjectWindow = true;
    closedProjectWindows.clear();
    try {
      const result = await git.openProject(path);
      if (!closedProjectWindows.has(result.window_label)) setOpenedProjectWindow(result.window_label);
      if (!result.warning) setRecentProjects(result.recent_projects);
    } finally {
      openingProjectWindow = false;
      closedProjectWindows.clear();
    }
  }

  async function initializeProject() {
    const path = initializePath();
    if (!path || busy() || openedProjectWindow()) return;
    setBusy(true); setInitializeError(""); setError("");
    try {
      if (await git.canInitializeProject(path)) await git.initializeProject(path);
      await openSelectedProject(path);
      setInitializePath("");
    } catch (e) { setInitializeError(String(e)); }
    finally { setBusy(false); }
  }

  async function openRecentProject(path: string) {
    if (busy() || openedProjectWindow()) return;
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
      setError(String(e));
      try { setHistory(await git.getHistory()); } catch { /* Keep the last loaded history. */ }
    } finally { setBusy(false); }
  }

  async function syncProject(action: SyncAction) {
    if (busy()) return;
    setBusy(true); setError(""); setSyncStatus(""); setSyncAction(action);
    try {
      setHistory(await git.sync(action));
      setSyncStatus(action === "push" ? t("app02") : "");
    } catch (e) {
      setError(String(e));
      try { setHistory(await git.getHistory()); } catch { /* Keep the loaded history. */ }
    } finally { setSyncAction(null); setBusy(false); }
  }

  function requestSync(action: SyncAction) {
    if (busy()) return;
    if (action === "push" || (action === "pull" && !history()?.sync.upstream)) {
      setTrackingMode(action === "push" ? "publish" : "upstream");
    } else void syncProject(action);
  }
  async function configureTracking(mode: TrackingMode, branch: string, remote: string, remoteBranch: string, url?: string) {
    if (busy()) throw new Error(t("hist01"));
    setBusy(true); setSyncStatus("");
    try {
      if (mode === "publish" && url) setHistory(await git.addRemote("origin", url));
      setHistory(mode === "publish" ? await git.publishBranch(branch, remote, remoteBranch) : await git.setUpstream(branch, remote, remoteBranch));
      if (mode === "publish") setSyncStatus(t("app02"));
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
    <SidebarProvider open={true} onOpenChange={() => {}} class={isHistory ? "" : "contents"}>
    <Show when={isHistory && history()}>{project => <RepositorySidebar onSettings={() => setSettingsOpen(true)} history={project()} mode={repositoryMode()} onModeChange={changeRepositoryMode} onChangeProject={() => { if (!busy()) void git.showProjectChooser().catch(() => setTerminalOpen(true)); }} disabled={busy()} onSwitchBranch={branch => void switchBranch(branch)}
      onCreateBranch={() => { setBranchName(""); setBranchError(""); setBranchDialogOpen(true); }}
      onCreateTag={createTag} onAddRemote={addRemote} />}</Show>
    <main class={isHistory ? "flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "flex min-h-dvh w-full flex-col items-center justify-center gap-6 p-6"}>
      <Show when={isHistory} fallback={
        <ProjectChooser projectOpen={Boolean(openedProjectWindow())} choosingProject={choosingProject()} busy={busy()} recentProjects={recentProjects()}
          onSelectProject={() => void selectProject()} onOpenRecent={path => void openRecentProject(path)} />
      }>
        <RepositoryToolbar onStashAll={() => { void runStash({ kind: "save", message: "", include_untracked: true }).catch(() => setTerminalOpen(true)); }} mode={repositoryMode()} onRefresh={() => void refreshHistory()} scope={historyScope()} onScopeChange={scope => { setHistoryScope(scope); setRepositoryMode("history"); }} busy={busy()} history={history()} action={syncAction()} status={syncStatus()} onSync={requestSync} onConfigureUpstream={() => setTrackingMode("upstream")} terminalOpen={terminalOpen()} onToggleTerminal={() => setTerminalOpen(value => !value)} />
        <Show when={history()}>{project => <CommitOperationBar history={project()} disabled={busy()} onShowConflicts={() => changeRepositoryMode("conflicts")} onRefresh={refreshHistory} onExecute={runCommitOperation} />}</Show>
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
        <Show when={history()} fallback={<Show when={terminalOpen()}><section class="min-h-0 flex-1"><TerminalPanel busy={busy()} /></section></Show>}>{project =>
            <section aria-label={t("app05")} class="min-h-0 min-w-0 flex-1">
              <RepositoryContent onStash={runStash} onRefresh={refreshHistory} scope={historyScope()} mode={repositoryMode()} onModeChange={changeRepositoryMode} history={project()} disabled={busy()} terminalOpen={terminalOpen()} onHistoryChange={setHistory} onBusyChange={setBusy} />
            </section>
        }</Show>
      </Show>
      <Show when={!isHistory && error() && !/invoke/i.test(error())}><Alert variant="destructive" class="max-w-xl"><AlertTitle>{t("app06")}</AlertTitle><AlertDescription class="break-all">{error()}</AlertDescription></Alert></Show>
    </main>
    <Show when={isHistory}><GitSettingsDialog hasProject open={settingsOpen()} onClose={() => setSettingsOpen(false)} /></Show>
    <InitializeRepositoryDialog path={initializePath()} pending={busy()} error={initializeError()}
      onConfirm={() => void initializeProject()} onCancel={() => { setInitializePath(""); setInitializeError(""); }} />
    </SidebarProvider>
  );
}
export default App;
