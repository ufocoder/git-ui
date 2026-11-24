import type { ForcePushTarget, History, PullMode, SyncAction } from "../git-types";
import { request } from "./transport";
import { invoke } from "@tauri-apps/api/core";

export const syncApi = {
  publishBranch: (branch: string, remote: string, remoteBranch: string) => request<History>("publish_project_branch", { branch, remote, remoteBranch }),
  setUpstream: (branch: string, remote: string, remoteBranch: string) => request<History>("set_project_upstream", { branch, remote, remoteBranch }),
  previewForcePush: (branch: string, head: string, expected: string) => invoke<ForcePushTarget>("preview_force_push", { branch, head, expected }),
  forcePushWithLease: (target: ForcePushTarget) => request<History>("force_push_with_lease", { target }),
  sync: (action: SyncAction, pullMode?: PullMode) => request<History>("sync_project", { action, pullMode }),
};
