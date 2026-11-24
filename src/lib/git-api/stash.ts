import type { StashAction, History, CommitDetails, FileDiff } from "../git-types";
import { request } from "./transport";

export const stashApi = {
  getStashDetails: (id: string) => request<CommitDetails>("get_stash_details", { id }),
  getStashDiff: (id: string, filePath: string) => request<FileDiff>("get_stash_diff", { id, filePath }),
  stash: (action: StashAction) => request<History>("stash_project", { action }),
};
