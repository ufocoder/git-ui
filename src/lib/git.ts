import { startOperation, finishOperation } from "./operation-feedback";
import { t } from "~/lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import { clearTerminalError, reportTerminalError } from "./terminal";

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
export type CommitOperation = { kind: "cherry_pick" | "revert"; commit: string; mainline?: number } | { kind: "amend"; commit: string; message: string; confirmed: boolean } | { kind: "continue" } | { kind: "abort" | "skip"; confirmed: boolean };
export type RepositoryMode = "history" | "commit" | "conflicts" | "stash";
export type ConflictVersion = { exists: boolean; text: string | null; binary: boolean; large: boolean; mode: string | null; oid: string | null };
export type ConflictFile = { file: CommitFile; base: ConflictVersion; ours: ConflictVersion; theirs: ConflictVersion; working_text: string | null; editable: boolean; supported: boolean; token: string };
export type ConflictResolution = { kind: "manual"; content: string } | { kind: "ours" | "theirs" };
export type OperationState = { kind: "cherry-pick" | "revert" | "merge"; commit: string; conflicts: number; staged: boolean };
export type BranchComparison = { base: string; ahead: number; behind: number };
export type StashEntry = { id: string; reference: string; message: string; date: string };
export type StashAction = { kind: "save"; message: string; include_untracked: boolean } | { kind: "apply"; id: string; restore_index: boolean } | { kind: "drop"; id: string; confirmed: boolean };
export type Remote = { name: string; branches: string[] };
export type SyncStatus = { upstream: string | null; remote_tip: string | null; ahead: number; behind: number };
export type HistoryScope = "all" | "incoming" | "outgoing";
export type History = {
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
export type SyncAction = "fetch" | "pull" | "push";

const operationLabels = (): Record<string, string> => ({
  get_git_settings: t("cfg01"), save_git_settings: t("cfg01"),
  stash_project: t("stash01"), get_stash_details: t("stash01"), get_stash_diff: t("stash01"),
  publish_project_branch: t("track01"), set_project_upstream: t("track02"),
  run_commit_operation: t("op27"),
  get_conflict_file: t("conf01"), resolve_conflict_file: t("conf07"),
  get_recent_projects: t("home07"), open_project: t("git01"), get_project_history: t("git02"),
  get_filtered_commit_page: t("find01"),
  get_sync_commit_page: t("sync13"),
  get_commit_page: t("git03"), get_commit_files: t("git04"), get_commit_details: t("git05"),
  get_file_diff: t("diff01"), switch_project_branch: t("cmd01"), create_project_branch: t("cmd02"),
  create_project_branch_at_commit: t("cmd03"),
  create_project_tag: t("cmd04"), create_project_tag_at_commit: t("cmd04"), add_project_remote: t("cmd05"),
  checkout_project_commit: t("cmd06"), reset_project_commit: t("cmd07"), set_project_file_staged: t("git06"),
  commit_project_changes: t("cmd08"), initialize_project: t("cmd09"), can_initialize_project: t("git07"),
});
const mutations = new Set(["save_git_settings","resolve_conflict_file","run_commit_operation","publish_project_branch", "set_project_upstream","stash_project","create_project_branch_at_commit","switch_project_branch", "create_project_branch", "create_project_tag", "create_project_tag_at_commit",
  "add_project_remote", "checkout_project_commit", "reset_project_commit", "set_project_file_staged", "commit_project_changes", "initialize_project", "sync_project"]);
function operationName(command: string, args?: Record<string, unknown>): string {
  if (command === "sync_project") return String(args?.action ?? "Git");
  if (command === "publish_project_branch") return t("track01");
  if (command === "commit_project_changes") return t("notice11");
  if (command === "run_commit_operation") return t("op27");
  if (command === "stash_project") {
    const kind = (args?.action as StashAction | undefined)?.kind;
    return kind === "save" ? t("stash02") : kind === "apply" ? t("stash08") : t("stash09");
  }
  if (command === "switch_project_branch") return t("notice12");
  if (command === "create_project_branch" || command === "create_project_branch_at_commit") return t("act17");
  if (command === "create_project_tag" || command === "create_project_tag_at_commit") return t("add01");
  if (command === "save_git_settings") return t("cfg01");
  return operationLabels()[command] ?? command;
}
async function request<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (mutations.has(command)) clearTerminalError();
  const notice = mutations.has(command) && command !== "set_project_file_staged" ? startOperation(operationName(command, args)) : undefined;
  try {
    const result = await invoke<T>(command, args);
    if (notice !== undefined) finishOperation(notice, operationName(command, args));
    return result;
  }
  catch (error) {
    // Polling failures are rendered by the terminal itself, avoiding a feedback loop.
    if (command !== "get_project_terminal_log") reportTerminalError(error, command === "sync_project" ? t("git08", { p1: String(args?.action) }) : operationLabels()[command] ?? command);
    throw error;
  }
}

// The Rust backend owns repository access; components use this typed API.
export const git = {
  checkInstallation: () => invoke<{ available: boolean; platform: string }>("get_git_installation"),
  getSettings: (scope: string) => request<GitSettings>("get_git_settings", { scope }),
  saveSettings: (scope: string, changes: GitSettingChange[]) => request<GitSettings>("save_git_settings", { scope, changes }),
  showProjectChooser: () => request<void>("show_project_chooser"),
  getStashDetails: (id: string) => request<CommitDetails>("get_stash_details", { id }),
  getStashDiff: (id: string, filePath: string) => request<FileDiff>("get_stash_diff", { id, filePath }),
  getRecentProjects: () => request<string[]>("get_recent_projects"),
  canInitializeProject: (path: string) => request<boolean>("can_initialize_project", { path }),
  initializeProject: (path: string) => request<void>("initialize_project", { path }),
  openProject: (path: string) => request<OpenProjectResult>("open_project", { path }),
  getTerminalLog: () => request<TerminalLog | null>("get_project_terminal_log"),
  getHistory: () => request<History>("get_project_history"),
  getCommitPage: (tip: string, offset: number) => request<CommitPage>("get_commit_page", { tip, offset }),
  getSyncCommitPage: (localTip: string, remoteTip: string, direction: Exclude<HistoryScope, "all">, offset: number) => request<CommitPage>("get_sync_commit_page", { localTip, remoteTip, direction, offset }),
  getFilteredCommitPage: (localTip: string, remoteTip: string | null, scope: HistoryScope, filter: HistoryFilter, offset: number) => request<CommitPage>("get_filtered_commit_page", { localTip, remoteTip, scope, filter, offset }),
  getCommitFiles: (commit: string) => request<CommitFile[]>("get_commit_files", { commit }),
  getCommitDetails: (commit: string) => request<CommitDetails>("get_commit_details", { commit }),
  getConflictFile: (file: string) => request<ConflictFile>("get_conflict_file", { file }),
  resolveConflict: (file: string, token: string, resolution: ConflictResolution) => request<History>("resolve_conflict_file", { file, token, resolution }),
  getFileDiff: (commit: string, filePath: string, scope?: WorktreeDiffScope) => request<FileDiff>("get_file_diff", { commit, filePath, scope }),
  switchBranch: (branch: string) => request<History>("switch_project_branch", { branch }),
  createBranch: (name: string) => request<History>("create_project_branch", { name }),
  createBranchAtCommit: (name: string, commit: string) => request<History>("create_project_branch_at_commit", { name, commit }),
  checkoutCommit: (commit: string) => request<History>("checkout_project_commit", { commit }),
  resetToCommit: (commit: string, mode: ResetMode, discardConfirmed: boolean, expectedHead: string, expectedBranch: string) => request<History>("reset_project_commit", { commit, mode, discardConfirmed, expectedHead, expectedBranch }),
  createTagAtCommit: (name: string, commit: string) => request<History>("create_project_tag_at_commit", { name, commit }),
  createTag: (name: string) => request<History>("create_project_tag", { name }),
  addRemote: (name: string, url: string) => request<History>("add_project_remote", { name, url }),
  setFileStaged: (filePath: string, staged: boolean) => request<CommitDetails>("set_project_file_staged", { filePath, staged }),
  commitChanges: (message: string, options?: CommitOptions) => request<History>("commit_project_changes", { message, options }),
  stash: (action: StashAction) => request<History>("stash_project", { action }),
  publishBranch: (branch: string, remote: string, remoteBranch: string) => request<History>("publish_project_branch", { branch, remote, remoteBranch }),
  setUpstream: (branch: string, remote: string, remoteBranch: string) => request<History>("set_project_upstream", { branch, remote, remoteBranch }),
  commitOperation: (head: string, branch: string, action: CommitOperation, options?: CommitOptions) => request<History>("run_commit_operation", { head, branch, action, options }),
  sync: (action: SyncAction) => request<History>("sync_project", { action }),
};

export function createWorktreeCommit(tip: string): Commit {
  return {
    hash: WORKTREE,
    author: "*",
    date: "",
    get subject() { return t("cf02"); },
    parents: tip ? [tip] : [],
    refs: [],
    uncommitted: true,
  };
}

export { buildCommitGraph, type GraphEdge, type GraphRow } from "./commit-graph";
