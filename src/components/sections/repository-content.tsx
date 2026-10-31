import { t } from "~/lib/i18n";
import { Show, createEffect, createSignal } from "solid-js";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import type { History, HistoryScope, RepositoryMode, StashAction } from "~/lib/git";
import StashWorkspace from "./stash-workspace";
import ConflictResolution from "./conflict-resolution";
import CommitTable from "./commit-table";
import WorktreeCommit from "./worktree-commit";
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
  const [sizes, setSizes] = createSignal([1, 0]);
  let terminalSize = 0.25;
  createEffect(() => setSizes(props.terminalOpen ? [1 - terminalSize, terminalSize] : [1, 0]));
  return <div class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1">
    <Resizable orientation="vertical" sizes={sizes()} onSizesChange={next => {
    if (props.terminalOpen && next[1] > 0) terminalSize = next[1];
    setSizes(next);
  }} class="min-h-0 min-w-0">
    <ResizablePanel minSize={0.3} class="min-h-0 min-w-0 overflow-hidden">
      <div class="h-full min-h-0" hidden={props.mode !== "history"}>
      <CommitTable scope={props.scope} history={props.history} disabled={props.disabled} onHistoryChange={props.onHistoryChange} onBusyChange={props.onBusyChange} />
      </div>
      <div class="h-full min-h-0" hidden={props.mode !== "commit"}>
        <WorktreeCommit history={props.history} active={props.mode === "commit"} disabled={props.disabled} onBusyChange={props.onBusyChange} onCommitted={props.onHistoryChange} onCommitCreated={() => props.onModeChange("history")} />
      </div>
      <div class="h-full min-h-0" hidden={props.mode !== "conflicts"}>
        <ConflictResolution history={props.history} active={props.mode === "conflicts"} disabled={props.disabled} onHistoryChange={props.onHistoryChange} onBusyChange={props.onBusyChange} onRefresh={props.onRefresh} onCreateCommit={() => props.onModeChange("commit")} />
      </div>
      <div class="h-full min-h-0" hidden={props.mode !== "stash"}><StashWorkspace history={props.history} active={props.mode === "stash"} disabled={props.disabled} onAction={props.onStash} /></div>
    </ResizablePanel>
    <ResizableHandle withHandle class={props.terminalOpen ? "" : "hidden"} aria-label={t("view01")} />
    <ResizablePanel minSize={props.terminalOpen ? 0.12 : 0} maxSize={0.6} class="min-h-0 min-w-0 overflow-hidden" id="repository-terminal" aria-hidden={!props.terminalOpen}>
      <Show when={props.terminalOpen}><TerminalPanel busy={props.disabled} /></Show>
    </ResizablePanel>
  </Resizable>
    </div>
  </div>;
}
