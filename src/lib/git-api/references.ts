import type { BranchRemoteTarget, BranchActionPreview, History, ResetMode } from "../git-types";
import { request } from "./transport";
import { invoke } from "@tauri-apps/api/core";

export const referencesApi = {
  getBranchComparisons: (names: string[]) => request<History["branch_comparisons"]>("get_branch_comparisons", { names }),
  switchBranch: (branch: string) => request<History>("switch_project_branch", { branch }),
  createBranch: (name: string) => request<History>("create_project_branch", { name }),
  createBranchAtCommit: (name: string, commit: string) => request<History>("create_project_branch_at_commit", { name, commit }),
  checkoutCommit: (commit: string) => request<History>("checkout_project_commit", { commit }),
  resetToCommit: (commit: string, mode: ResetMode, discardConfirmed: boolean, expectedHead: string, expectedBranch: string) => request<History>("reset_project_commit", { commit, mode, discardConfirmed, expectedHead, expectedBranch }),
  createTagAtCommit: (name: string, commit: string) => request<History>("create_project_tag_at_commit", { name, commit }),
  getOriginTags: () => invoke<Record<string, string>>("get_origin_tags"),
  remoteTagExists: (remote: string, tag: string) => request<boolean>("remote_project_tag_exists", { remote, tag }),
  previewBranchAction: (name: string, checkRemotes: boolean) => request<BranchActionPreview>("preview_branch_action", { name, checkRemotes }),
  executeBranchAction: (action: "delete" | "rebase", preview: BranchActionPreview, remote: BranchRemoteTarget | null) => request<History>("execute_branch_action", { action, preview, remote, confirmed: true }),
  changeReference: (kind: "branch" | "tag", name: string, newName: string | null) => request<History>("change_project_reference", { kind, name, newName, confirmed: newName === null }),
  deleteTag: (tag: string, remote: string | null) => request<History>("delete_project_tag", { tag, remote, confirmed: true }),
  pushTags: (remote: string, tag: string | null) => request<History>("push_project_tags", { remote, tag }),
  createTag: (name: string) => request<History>("create_project_tag", { name }),
  addRemote: (name: string, url: string) => request<History>("add_project_remote", { name, url }),
};
