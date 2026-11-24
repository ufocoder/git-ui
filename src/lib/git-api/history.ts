import type { CommitOptions, CommitOperation, HistoryRewriteTarget, HistoryRewritePreview, HistoryScope, History, HistoryFilter, CommitPage, CommitFile, CommitDetails } from "../git-types";
import { request } from "./transport";
import { invoke } from "@tauri-apps/api/core";
import { createSearchRequests } from "../search-requests";

const historySearch = createSearchRequests(
  (requestId: string, args: Record<string, unknown>) => request<CommitPage>("get_filtered_commit_page", { ...args, requestId }),
  requestId => invoke<void>("cancel_history_search", { requestId }),
);


export const historyApi = {
  getHistory: () => request<History>("get_project_history"),
  getCommitPage: (tip: string, offset: number, allBranches = true, tips?: string[], firstParent = false) => request<CommitPage>("get_commit_page", { tip, offset, allBranches, tips, firstParent }),
  getSyncCommitPage: (localTip: string, remoteTip: string, direction: Exclude<HistoryScope, "all">, offset: number) => request<CommitPage>("get_sync_commit_page", { localTip, remoteTip, direction, offset }),
  getFilteredCommitPage: (localTip: string, remoteTip: string | null, scope: HistoryScope, filter: HistoryFilter, offset: number, allBranches = true, tips?: string[], firstParent = false) => historySearch.run({ localTip, remoteTip, scope, filter, offset, allBranches, tips, firstParent }),
  cancelHistorySearch: historySearch.cancel,
  getCommitFiles: (commit: string) => request<CommitFile[]>("get_commit_files", { commit }),
  getCommitDetails: (commit: string) => request<CommitDetails>("get_commit_details", { commit }),
  restoreRewrittenHistory: (head: string, branch: string) => request<History>("restore_rewritten_history", { head, branch }),
  previewHistoryRewrite: (target: HistoryRewriteTarget) => request<HistoryRewritePreview>("preview_history_rewrite", { target }),
  rewriteHistory: (target: HistoryRewriteTarget, message: string, acceptPublished: boolean) => request<History>("rewrite_history", { target, message, acceptPublished }),
  commitOperation: (head: string, branch: string, action: CommitOperation, options?: CommitOptions) => request<History>("run_commit_operation", { head, branch, action, options }),
};
