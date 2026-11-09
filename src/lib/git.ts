import { startOperation, finishOperation } from "./operation-feedback";
import { t } from "~/lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import { clearTerminalError, reportTerminalError } from "./terminal";
import { WORKTREE } from "./git-types";
import type {
  BranchRemoteTarget,
  BranchActionPreview,
  RestorePreview,
  GitSettings,
  GitSettingChange,
  CommitOptions,
  WorktreeDiffScope,
  Commit,
  CommitOperation,
  HistoryRewriteTarget,
  ForcePushTarget,
  HistoryRewritePreview,
  ConflictFile,
  ConflictResolution,
  StashAction,
  HistoryScope,
  History,
  HistoryFilter,
  CommitPage,
  CommitFile,
  CommitDetails,
  FileDiff,
  OpenProjectResult,
  ResetMode,
  TerminalLog,
  CommitPushTarget,
  PullMode,
  SyncAction,
} from "./git-types";

export * from "./git-types";

const operationLabels = (): Record<string, string> => ({
  restore_project_path: t("file-action.reset"), preview_restore_path: t("file-action.reset"), reveal_project_path: t("file-action.reveal"),
  open_project_remote: t("project.view-remote"),
  get_branch_comparisons: t("sidebar.branches"),
  get_git_settings: t("git-settings.title"), save_git_settings: t("git-settings.title"),
  stash_project: t("stash.title"), get_stash_details: t("stash.title"), get_stash_diff: t("stash.title"),
  preview_branch_action: t("branch-action.checking"), execute_branch_action: t("ref-action.update"),
  change_project_reference: t("ref-action.update"),
  push_project_tags: t("tag-push.title"), delete_project_tag: t("tag-delete.title"), remote_project_tag_exists: t("tag-delete.checking"),
  publish_project_branch: t("upstream.publish-branch"), set_project_upstream: t("upstream.set"),
  restore_rewritten_history: t("rewrite.restore"), stage_worktree_hunk: t("stage.hunk"),
  preview_force_push: t("push.lease-title"), force_push_with_lease: t("push.lease-title"),
  preview_history_rewrite: t("rewrite.preview"), rewrite_history: t("rewrite.title"),
  run_commit_operation: t("operation.title"),
  get_conflict_file: t("conflict.title"), resolve_conflict_file: t("conflict.save"),
  get_recent_projects: t("home.recent"), open_project: t("git.open"), get_project_history: t("git.read-history"),
  get_filtered_commit_page: t("search.commits"),
  get_sync_commit_page: t("sync.commits"),
  get_commit_page: t("git.load-commits"), get_commit_files: t("git.read-files"), get_commit_details: t("git.read-commit"),
  get_file_diff: t("diff.view"), switch_project_branch: t("command.switch"), create_project_branch: t("command.switch-create"),
  create_project_branch_at_commit: t("command.branch"),
  create_project_tag: t("command.tag"), create_project_tag_at_commit: t("command.tag"), add_project_remote: t("command.add-remote"),
  checkout_project_commit: t("command.detach"), reset_project_commit: t("command.reset"), set_project_file_staged: t("git.stage"),
  commit_project_changes: t("command.commit"), initialize_project: t("command.init"), can_initialize_project: t("git.check-folder"),
});
const mutations = new Set(["rewrite_history", "restore_rewritten_history", "stage_worktree_hunk", "force_push_with_lease","execute_branch_action","change_project_reference","delete_project_tag","push_project_tags","restore_project_path","save_git_settings","resolve_conflict_file","run_commit_operation","publish_project_branch", "set_project_upstream","stash_project","create_project_branch_at_commit","switch_project_branch", "create_project_branch", "create_project_tag", "create_project_tag_at_commit",
  "add_project_remote", "checkout_project_commit", "reset_project_commit", "set_project_file_staged", "commit_project_changes", "initialize_project", "sync_project"]);
function operationName(command: string, args?: Record<string, unknown>): string {
  if (command === "execute_branch_action") return args?.action === "delete" ? t("ref-action.delete-branch") : t("branch-action.rebase");
  if (command === "sync_project") return String(args?.action ?? "Git");
  if (command === "publish_project_branch") return t("upstream.publish-branch");
  if (command === "commit_project_changes") return t("notice.commit");
  if (command === "run_commit_operation") return t("operation.title");
  if (command === "stash_project") {
    const kind = (args?.action as StashAction | undefined)?.kind;
    return kind === "save" ? t("stash.save-changes") : kind === "apply" ? t("stash.apply") : t("stash.delete");
  }
  if (command === "switch_project_branch") return t("notice.switch");
  if (command === "create_project_branch" || command === "create_project_branch_at_commit") return t("branch.create");
  if (command === "create_project_tag" || command === "create_project_tag_at_commit") return t("tag.create");
  if (command === "save_git_settings") return t("git-settings.title");
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
    if (command !== "get_project_terminal_log") reportTerminalError(error, command === "sync_project" ? t("git.command", { p1: String(args?.action) }) : operationLabels()[command] ?? command);
    throw error;
  }
}

// The Rust backend owns repository access; components use this typed API.
export const git = {
  fileActionsPlatform: () => invoke<string>("file_actions_platform"),
  previewRestorePath: (file: string, commit: string) => request<RestorePreview>("preview_restore_path", { file, commit }),
  restorePath: (file: string, preview: RestorePreview, confirmed: boolean) => request<History>("restore_project_path", { file, commit: preview.commit, head: preview.head, branch: preview.branch, confirmed }),
  openProjectRemote: (remote: string) => request<void>("open_project_remote", { remote }),
  revealPath: (file?: string) => request<void>("reveal_project_path", { file }),
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
  getBranchComparisons: (names: string[]) => request<History["branch_comparisons"]>("get_branch_comparisons", { names }),
  getHistory: () => request<History>("get_project_history"),
  getCommitPage: (tip: string, offset: number, allBranches = true, tips?: string[], firstParent = false) => request<CommitPage>("get_commit_page", { tip, offset, allBranches, tips, firstParent }),
  getSyncCommitPage: (localTip: string, remoteTip: string, direction: Exclude<HistoryScope, "all">, offset: number) => request<CommitPage>("get_sync_commit_page", { localTip, remoteTip, direction, offset }),
  getFilteredCommitPage: (localTip: string, remoteTip: string | null, scope: HistoryScope, filter: HistoryFilter, offset: number, allBranches = true, tips?: string[], firstParent = false) => request<CommitPage>("get_filtered_commit_page", { localTip, remoteTip, scope, filter, offset, allBranches, tips, firstParent }),
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
  remoteTagExists: (remote: string, tag: string) => request<boolean>("remote_project_tag_exists", { remote, tag }),
  previewBranchAction: (name: string, checkRemotes: boolean) => request<BranchActionPreview>("preview_branch_action", { name, checkRemotes }),
  executeBranchAction: (action: "delete" | "rebase", preview: BranchActionPreview, remote: BranchRemoteTarget | null) => request<History>("execute_branch_action", { action, preview, remote, confirmed: true }),
  changeReference: (kind: "branch" | "tag", name: string, newName: string | null) => request<History>("change_project_reference", { kind, name, newName, confirmed: newName === null }),
  deleteTag: (tag: string, remote: string | null) => request<History>("delete_project_tag", { tag, remote, confirmed: true }),
  pushTags: (remote: string, tag: string | null) => request<History>("push_project_tags", { remote, tag }),
  createTag: (name: string) => request<History>("create_project_tag", { name }),
  addRemote: (name: string, url: string) => request<History>("add_project_remote", { name, url }),
  setFileStaged: (filePath: string, staged: boolean) => request<CommitDetails>("set_project_file_staged", { filePath, staged }),
  commitChanges: (message: string, options?: CommitOptions) => request<History>("commit_project_changes", { message, options }),
  stash: (action: StashAction) => request<History>("stash_project", { action }),
  publishBranch: (branch: string, remote: string, remoteBranch: string) => request<History>("publish_project_branch", { branch, remote, remoteBranch }),
  setUpstream: (branch: string, remote: string, remoteBranch: string) => request<History>("set_project_upstream", { branch, remote, remoteBranch }),
  restoreRewrittenHistory: (head: string, branch: string) => request<History>("restore_rewritten_history", { head, branch }),
  stageWorktreeHunk: (filePath: string, snapshot: string, index: number) => request<CommitDetails>("stage_worktree_hunk", { filePath, snapshot, index }),
  previewForcePush: (branch: string, head: string, expected: string) => invoke<ForcePushTarget>("preview_force_push", { branch, head, expected }),
  forcePushWithLease: (target: ForcePushTarget) => request<History>("force_push_with_lease", { target }),
  previewHistoryRewrite: (target: HistoryRewriteTarget) => request<HistoryRewritePreview>("preview_history_rewrite", { target }),
  rewriteHistory: (target: HistoryRewriteTarget, message: string, acceptPublished: boolean) => request<History>("rewrite_history", { target, message, acceptPublished }),
  commitOperation: (head: string, branch: string, action: CommitOperation, options?: CommitOptions) => request<History>("run_commit_operation", { head, branch, action, options }),
  sync: (action: SyncAction, pullMode?: PullMode) => request<History>("sync_project", { action, pullMode }),
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
