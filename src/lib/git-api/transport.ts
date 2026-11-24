import { invoke } from "@tauri-apps/api/core";
import { startOperation, finishOperation } from "../operation-feedback";
import { t } from "../i18n";
import { clearTerminalError, reportTerminalError } from "../terminal";
import { SEARCH_CANCELLED } from "../search-requests";
import type { StashAction } from "../git-types";

const operationLabels = (): Record<string, string> => ({
  preview_discard_changes: t("discard.title"), discard_worktree_changes: t("discard.title"),
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
const mutations = new Set(["discard_worktree_changes", "rewrite_history", "restore_rewritten_history", "stage_worktree_hunk", "force_push_with_lease","execute_branch_action","change_project_reference","delete_project_tag","push_project_tags","restore_project_path","save_git_settings","resolve_conflict_file","run_commit_operation","publish_project_branch", "set_project_upstream","stash_project","create_project_branch_at_commit","switch_project_branch", "create_project_branch", "create_project_tag", "create_project_tag_at_commit",
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
export async function request<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (mutations.has(command)) clearTerminalError();
  const notice = mutations.has(command) && command !== "set_project_file_staged" ? startOperation(operationName(command, args)) : undefined;
  try {
    const result = await invoke<T>(command, args);
    if (notice !== undefined) finishOperation(notice, operationName(command, args));
    return result;
  }
  catch (error) {
    if (command === "get_filtered_commit_page" && String(error) === SEARCH_CANCELLED) throw error;
    // Polling failures are rendered by the terminal itself, avoiding a feedback loop.
    if (command !== "get_project_terminal_log") reportTerminalError(error, command === "sync_project" ? t("git.command", { p1: String(args?.action) }) : operationLabels()[command] ?? command);
    throw error;
  }
}

