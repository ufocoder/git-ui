export type BranchRemoteTarget = { remote: string; reference: string; tip: string | null; error: string | null };
export type BranchActionPreview = { name: string; tip: string; head: string; branch: string; remotes: BranchRemoteTarget[] };

export type RestorePreview = { commit: string; subject: string; head: string; branch: string };

export type GitSettings = { values: Record<string, string>; effective: Record<string, string> };
export type GitSettingChange = { key: string; value: string | null };

export type CommitOptions = { sign?: boolean };

export type WorktreeDiffScope = "staged" | "unstaged";

export const WORKTREE = "WORKTREE";

export type CommitReference = { name: string; kind: "branch" | "remote" | "tag" };

export type Commit = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  parents: string[];
  refs: CommitReference[];
  uncommitted?: boolean;
};
export type ForcePushTarget = { branch: string; head: string; remote: string; reference: string; expected: string; endpoint: string };
export type RewriteRecovery = { branch: string; head: string };
export type HistoryRewriteTarget = { head: string; branch: string; commits: string[] };
export type HistoryRewritePreview = { count: number; published: boolean; messages: string[]; backup: string };
export type CommitOperation = { kind: "cherry_pick" | "revert"; commit: string; mainline?: number } | { kind: "amend"; commit: string; message: string; confirmed: boolean } | { kind: "continue" } | { kind: "abort" | "skip"; confirmed: boolean };
export type RepositoryMode = "history" | "commit" | "conflicts" | "stash";
export type ConflictVersion = { exists: boolean; text: string | null; binary: boolean; large: boolean; mode: string | null; oid: string | null };
export type ConflictFile = { file: CommitFile; base: ConflictVersion; ours: ConflictVersion; theirs: ConflictVersion; working_text: string | null; editable: boolean; supported: boolean; token: string };
export type ConflictResolution = { kind: "manual"; content: string } | { kind: "ours" | "theirs" };
export type OperationState = { kind: "cherry-pick" | "revert" | "merge" | "rebase"; commit: string; conflicts: number; staged: boolean };
export type BranchComparison = { base: string; ahead: number; behind: number };
export type StashEntry = { id: string; reference: string; message: string; date: string };
export type StashAction = { kind: "save"; message: string; include_untracked: boolean } | { kind: "apply"; id: string; restore_index: boolean } | { kind: "drop"; id: string; confirmed: boolean };
export type Remote = { name: string; branches: string[] };
export type SyncStatus = { upstream: string | null; remote_tip: string | null; ahead: number; behind: number };
export type HistoryScope = "all" | "incoming" | "outgoing";
export type History = {
  worktree_files?: CommitFile[];
  git_lfs_missing?: boolean;
  tag_tips: Record<string, string>;
  branch_tips?: Record<string, string>;
  last_fetch?: number | null;
  path: string;
  commits: Commit[];
  branches: string[];
  branch_comparisons: Record<string, BranchComparison>;
  tags: string[];
  stashes: StashEntry[];
  remotes: Remote[];
  current_branch: string;
  sync: SyncStatus;
  operation: OperationState | null;
  conflicts: CommitFile[];
  tip: string;
  has_more: boolean;
  has_changes: boolean;
};
export type HistoryFilter = { text: string; sha: string; author: string; file: string };
export type CommitPage = { commits: Commit[]; has_more: boolean };
export type CommitFile = { path: string; old_path: string | null; status: string; staged: boolean; partially_staged: boolean };
export type CommitDetails = { message: string; files: CommitFile[] };
export type FileDiff = { commit: string; file: CommitFile; patch: string; truncated: boolean };
export type OpenProjectResult = { history: History; recent_projects: string[]; warning: string | null };
export type ResetMode = "soft" | "mixed" | "hard";
export type TerminalLog = { id: number; command: string; output: string; status: "running" | "success" | "error"; exit_code: number | null };
export type CommitPushTarget = {
  path: string;
  branch: string;
  tip: string;
  upstream: string | null;
  remote: string;
};

export type PullMode = "fast-forward-only" | "rebase" | "merge";
export type SyncAction = "fetch" | "pull" | "push";
