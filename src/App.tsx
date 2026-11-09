import OperationStatus from "~/components/sections/operation-status";
import KeyboardShortcutsDialog from "~/components/sections/keyboard-shortcuts-dialog";
import { matchesShortcut } from "~/lib/keyboard-shortcuts";
import GitSettingsDialog from "~/components/sections/git-settings-dialog";
import UpdateDialog from "~/components/sections/update-dialog";
import { operationNotice, dismissOperation } from "~/lib/operation-feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { t } from "~/lib/i18n";
import { Show, batch, createSignal, onCleanup, onMount } from "solid-js";
import { git, type History } from "~/lib/git";
import { clearTerminalError } from "~/lib/terminal";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarProvider } from "~/components/ui/sidebar";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";

import InitializeRepositoryDialog from "~/components/sections/initialize-repository-dialog";
import ProjectSwitcherDialog from "~/components/sections/project-switcher-dialog";
import GitRequirement, { type GitCheckState } from "~/components/sections/git-requirement";
import ProjectChooser from "~/components/sections/project-chooser";

import RepositoryWorkspace from "~/features/repository/repository-workspace";

function App() {
  const [isHistory, setIsHistory] = createSignal(new URLSearchParams(window.location.search).get("view") === "history");
  const [updatesOpen, setUpdatesOpen] = createSignal(new URLSearchParams(window.location.search).get("view") === "updates");
  const [installingUpdate, setInstallingUpdate] = createSignal(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let unlistenUpdates: UnlistenFn | undefined;
  let unlistenSettings: UnlistenFn | undefined;
  let unlistenShortcuts: UnlistenFn | undefined;
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  let disposed = false;
  onCleanup(() => { disposed = true; unlistenUpdates?.(); unlistenShortcuts?.(); unlistenSettings?.(); });
  const [gitCheck, setGitCheck] = createSignal<GitCheckState>(isTauri() ? "checking" : "ready");
  const [gitPlatform, setGitPlatform] = createSignal("");
  const [choosingProject, setChoosingProject] = createSignal(false);
  const [error, setError] = createSignal("");
  const [history, setHistory] = createSignal<History>();
  const [initializePath, setInitializePath] = createSignal("");
  const [initializeError, setInitializeError] = createSignal("");
  const [recentProjects, setRecentProjects] = createSignal<string[]>([]);
  onMount(() => {
    const refreshShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut("help", event)) {
        event.preventDefault();
        if (!installingUpdate()) setShortcutsOpen(true);
        return;
      }
    };
    window.addEventListener("keydown", refreshShortcut, { capture: true });
    onCleanup(() => window.removeEventListener("keydown", refreshShortcut, { capture: true }));
  });

  onMount(async () => {
    setBusy(true);
    try {
      if (isTauri()) {
        const unlisten = await listen("check-updates", () => setUpdatesOpen(true));
        if (disposed) { unlisten(); return; }
        unlistenUpdates = unlisten;
        const settingsListener = await listen("open-settings", () => {
          if (!installingUpdate()) setSettingsOpen(true);
        });
        if (disposed) { settingsListener(); return; }
        unlistenSettings = settingsListener;
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
      try { path = await open({ directory: true, multiple: false, title: t("app.choose-folder") }); }
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
      setProjectSwitcherOpen(false); setSettingsOpen(false);
      setHistory(result.history);
      setIsHistory(true);
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

  return (
    <SidebarProvider open={true} onOpenChange={() => {}} class={isHistory() ? "" : "contents"}>
    <div aria-hidden="true" class="pointer-events-none fixed inset-x-0 top-0 z-30 h-px bg-[hsl(var(--panel-divider)/0.55)]" />
    <Show keyed when={isHistory() && history()} fallback={
      <main class="flex h-dvh w-full flex-col items-center gap-6 overflow-y-auto p-6 [justify-content:safe_center]">
        <Show when={!isHistory()} fallback={<p role="status" class="text-sm text-muted-foreground">{error() || t("common.loading")}</p>}>
        <ProjectChooser choosingProject={choosingProject()} busy={busy()} recentProjects={recentProjects()}
          ready={gitCheck() === "ready"} requirement={<GitRequirement state={gitCheck()} platform={gitPlatform()} onRetry={() => void retryGitCheck()} />}
          onSelectProject={() => void selectProject()} onOpenRecent={path => void openRecentProject(path)} />
        </Show>
      <Show when={!isHistory() && error() && !/invoke/i.test(error())}><Alert variant="destructive" class="max-w-xl"><AlertTitle>{t("app.action-failed")}</AlertTitle><AlertDescription class="break-all">{error()}</AlertDescription></Alert></Show>
        <OperationStatus />
      </main>
    }>{project =>
      <RepositoryWorkspace initialHistory={project} busy={busy()} onBusyChange={setBusy} installingUpdate={installingUpdate()}
        projectMenuOpen={projectSwitcherOpen()} onChangeProject={changeProject} onSettings={() => setSettingsOpen(true)} />
    }</Show>
    <GitSettingsDialog hasProject={isHistory() && Boolean(history())} open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
    <Dialog open={updatesOpen()} onOpenChange={open => { if (!installingUpdate()) setUpdatesOpen(open); }}>
      <Show when={updatesOpen()}><DialogContent class="max-h-[90dvh] overflow-auto p-0 sm:max-w-lg">
        <DialogHeader class="sr-only"><DialogTitle>{t("update.title")}</DialogTitle><DialogDescription>{t("update.restart-note")}</DialogDescription></DialogHeader>
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
