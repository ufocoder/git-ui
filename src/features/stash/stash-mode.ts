import type { History, RepositoryMode, StashAction } from "~/lib/git";

export function modeAfterStash(action: StashAction, history: History, mode: RepositoryMode): RepositoryMode {
  if (history.conflicts.length) return "conflicts";
  const appliedLastEntry = action.kind === "apply" && !history.stashes.some(entry => entry.id !== action.id);
  const emptyStash = mode === "stash" && !history.stashes.length;
  if (appliedLastEntry || emptyStash) return history.has_changes ? "commit" : "history";
  return mode;
}
