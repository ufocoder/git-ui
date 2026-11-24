import { historyApi } from "./git-api/history";
import { worktreeApi } from "./git-api/worktree";
import { stashApi } from "./git-api/stash";
import { syncApi } from "./git-api/sync";
import { referencesApi } from "./git-api/references";
import { projectsApi } from "./git-api/projects";
import { conflictsApi } from "./git-api/conflicts";
import { WORKTREE, type Commit, type CommitPushTarget, type History } from "./git-types";
import { t } from "./i18n";

export * from "./git-types";

// Compatibility facade; features may import their domain API directly.
export const git = {
  ...historyApi,
  ...worktreeApi,
  ...stashApi,
  ...syncApi,
  ...referencesApi,
  ...projectsApi,
  ...conflictsApi,
};

export function pushCommittedBranch(target: CommitPushTarget): Promise<History> {
  return target.upstream
    ? git.sync("push")
    : git.publishBranch(target.branch, target.remote, target.branch);
}

export function createWorktreeCommit(tip: string): Commit {
  return {
    hash: WORKTREE,
    author: "*",
    date: "",
    get subject() { return t("details.uncommitted"); },
    parents: tip ? [tip] : [],
    refs: [],
    uncommitted: true,
  };
}

export { buildCommitGraph, type GraphEdge, type GraphRow } from "./commit-graph";
