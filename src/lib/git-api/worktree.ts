import type { RestorePreview, CommitOptions, WorktreeDiffScope, History, CommitDetails, FileDiff, DiscardPreview, DiscardTarget, DiscardResult } from "../git-types";
import { request } from "./transport";

export const worktreeApi = {
  previewDiscardChanges: (paths: string[]) => request<DiscardPreview>("preview_discard_changes", { paths }),
  discardWorktreeChanges: (target: DiscardTarget) => request<DiscardResult>("discard_worktree_changes", { target, confirmed: true }),
  previewRestorePath: (file: string, commit: string) => request<RestorePreview>("preview_restore_path", { file, commit }),
  restorePath: (file: string, preview: RestorePreview, confirmed: boolean) => request<History>("restore_project_path", { file, commit: preview.commit, head: preview.head, branch: preview.branch, confirmed }),
  getFileDiff: (commit: string, filePath: string, scope?: WorktreeDiffScope) => request<FileDiff>("get_file_diff", { commit, filePath, scope }),
  setFileStaged: (filePath: string, staged: boolean) => request<CommitDetails>("set_project_file_staged", { filePath, staged }),
  setFilesStaged: (filePaths: string[], staged: boolean) => request<CommitDetails>("set_project_files_staged", { filePaths, staged }),
  commitChanges: (message: string, options?: CommitOptions) => request<History>("commit_project_changes", { message, options }),
  stageWorktreeHunk: (filePath: string, snapshot: string, index: number) => request<CommitDetails>("stage_worktree_hunk", { filePath, snapshot, index }),
};
