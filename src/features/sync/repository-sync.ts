import { createSignal } from "solid-js";
import { t } from "~/lib/i18n";
import type { git, ForcePushTarget, History, PullMode, SyncAction } from "~/lib/git";

export type TrackingMode = "publish" | "upstream";

type SyncPort = Pick<typeof git, "sync" | "getHistory" | "addRemote" | "publishBranch" | "setUpstream" | "previewForcePush" | "forcePushWithLease">;

export function createRepositorySync(api: SyncPort, session: {
  history: () => History;
  busy: () => boolean;
  setBusy: (busy: boolean) => void;
  setHistory: (history: History) => void;
  onPushCompleted: (history: History) => void;
}) {
  const [action, setAction] = createSignal<SyncAction | null>(null);
  const [forceTarget, setForceTarget] = createSignal<ForcePushTarget>();
  const [trackingMode, setTrackingMode] = createSignal<TrackingMode>();

  async function refreshAfterFailure() {
    try { session.setHistory(await api.getHistory()); }
    catch { /* Keep the last loaded history. */ }
  }

  async function run(next: SyncAction, pullMode?: PullMode) {
    const before = session.history();
    session.setBusy(true);
    setAction(next);
    try {
      const updated = await api.sync(next, pullMode);
      session.setHistory(updated);
      if (next === "push") session.onPushCompleted(updated);
    } catch (error) {
      await refreshAfterFailure();
      if (next === "push" && before.sync.remote_tip && /non-fast-forward|fetch first/i.test(String(error))) {
        try { setForceTarget(await api.previewForcePush(before.current_branch, before.tip, before.sync.remote_tip)); }
        catch { /* The original rejection remains in the terminal. */ }
      }
    } finally {
      setAction(null);
      session.setBusy(false);
    }
  }

  function request(next: SyncAction, pullMode?: PullMode) {
    if (session.busy()) return;
    const project = session.history();
    if (next === "push" && (!project.remotes.length || !project.sync.upstream)) {
      setTrackingMode("publish");
    } else if (next === "pull" && !project.sync.upstream) {
      setTrackingMode("upstream");
    } else {
      void run(next, pullMode);
    }
  }

  async function configure(mode: TrackingMode, branch: string, remote: string, remoteBranch: string, url?: string) {
    if (session.busy()) throw new Error(t("history.busy"));
    session.setBusy(true);
    try {
      if (mode === "publish" && url) session.setHistory(await api.addRemote("origin", url));
      const updated = mode === "publish"
        ? await api.publishBranch(branch, remote, remoteBranch)
        : await api.setUpstream(branch, remote, remoteBranch);
      session.setHistory(updated);
      if (mode === "publish") session.onPushCompleted(updated);
    } catch (error) {
      await refreshAfterFailure();
      throw error;
    } finally {
      session.setBusy(false);
    }
  }

  async function forcePush() {
    const target = forceTarget();
    if (!target || session.busy()) return;
    setForceTarget(undefined);
    session.setBusy(true);
    setAction("push");
    try {
      const updated = await api.forcePushWithLease(target);
      session.setHistory(updated);
      session.onPushCompleted(updated);
    } catch { await refreshAfterFailure(); }
    finally { setAction(null); session.setBusy(false); }
  }

  return { action, trackingMode, setTrackingMode, request, configure, forceTarget, setForceTarget, forcePush };
}
