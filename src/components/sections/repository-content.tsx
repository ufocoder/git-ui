import { LayoutScope, readPanelSizes, validPanelSizes } from "~/lib/layout-preferences";
import { t } from "~/lib/i18n";
import { Match, Show, Suspense, Switch, createSignal, lazy } from "solid-js";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import type { History, HistoryScope, RepositoryMode, StashAction } from "~/lib/git";
import { createCommitDraft, createConflictDraft, createHistorySearch } from "~/lib/repository-drafts";
const StashWorkspace = lazy(() => import("./stash-workspace"));
const ConflictResolution = lazy(() => import("./conflict-resolution"));
const CommitTable = lazy(() => import("./commit-table"));
const WorktreeCommit = lazy(() => import("./worktree-commit"));
import TerminalPanel from "./terminal-panel";

type RepositoryContentProps = {
  onStash: (action: StashAction) => Promise<void>;
  mode: RepositoryMode;
  onModeChange: (mode: RepositoryMode) => void;
  scope: HistoryScope;
  history: History;
  disabled: boolean;
  terminalOpen: boolean;
  onRefresh: () => Promise<void>;
  onHistoryChange: (history: History) => void;
  onBusyChange: (busy: boolean) => void;
};
export default function RepositoryContent(props: RepositoryContentProps) {
  const commitDraft = createCommitDraft();
  const conflictDraft = createConflictDraft();
  const historySearch = createHistorySearch();
  const [terminalSizes, setTerminalSizes] = createSignal(readPanelSizes(props.history.path, "workspace.terminal", [0.75, 0.25]));
  const sizes = () => props.terminalOpen ? terminalSizes() : [1, 0];
  return <LayoutScope.Provider value={() => props.history.path}><div class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1">
    <Resizable layoutId="workspace.terminal" initialSizes={[0.75, 0.25]} orientation="vertical" sizes={sizes()} onSizesChange={next => {
    if (props.terminalOpen && validPanelSizes(next, 2)) setTerminalSizes(next);
  }} class="min-h-0 min-w-0">
    <ResizablePanel minSize={0.3} class="min-h-0 min-w-0 overflow-hidden">
      <Suspense fallback={<p role="status" class="p-4 text-sm text-muted-foreground">{t("ui01")}</p>}>
        <Switch>
          <Match when={props.mode === "history"}>
            <CommitTable search={historySearch} scope={props.scope} history={props.history} disabled={props.disabled} onHistoryChange={props.onHistoryChange} onBusyChange={props.onBusyChange} />
          </Match>
          <Match when={props.mode === "commit"}>
            <WorktreeCommit draft={commitDraft} history={props.history} disabled={props.disabled} onBusyChange={props.onBusyChange} onCommitted={props.onHistoryChange} onCommitCreated={() => props.onModeChange("history")} />
          </Match>
          <Match when={props.mode === "conflicts"}>
            <ConflictResolution draft={conflictDraft} history={props.history} disabled={props.disabled} onHistoryChange={props.onHistoryChange} onBusyChange={props.onBusyChange} onRefresh={props.onRefresh} onCreateCommit={() => props.onModeChange("commit")} />
          </Match>
          <Match when={props.mode === "stash"}>
            <StashWorkspace history={props.history} disabled={props.disabled} onAction={props.onStash} />
          </Match>
        </Switch>
      </Suspense>
    </ResizablePanel>
    <ResizableHandle withHandle class={props.terminalOpen ? "" : "hidden"} aria-label={t("view01")} />
    <ResizablePanel minSize={props.terminalOpen ? 0.12 : 0} maxSize={0.6} class="min-h-0 min-w-0 overflow-hidden" id="repository-terminal" aria-hidden={!props.terminalOpen}>
      <Show when={props.terminalOpen}><TerminalPanel busy={props.disabled} /></Show>
    </ResizablePanel>
  </Resizable>
    </div>
  </div></LayoutScope.Provider>;
}
