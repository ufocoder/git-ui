import { createEffect, createMemo, onCleanup, onMount, type Accessor, type Setter } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { matchesShortcut } from "~/lib/keyboard-shortcuts";
import type { History } from "~/lib/git-types";

export function createRepositoryRefresh(options: {
  history: Accessor<History>;
  historyBranch: Accessor<string>;
  setHistoryBranch: Setter<string>;
  busy: Accessor<boolean>;
  installingUpdate: Accessor<boolean>;
  refreshHistory: () => Promise<void>;
}) {
  const { history, historyBranch, setHistoryBranch, busy, refreshHistory } = options;
  let disposed = false;
  onCleanup(() => { disposed = true; });
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
  onMount(() => {
    const refreshShortcut = (event: KeyboardEvent) => {
      if (!matchesShortcut("refresh", event)) return;
      event.preventDefault();
      if (!event.repeat && !busy() && !options.installingUpdate()) void refreshHistory();
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

}
