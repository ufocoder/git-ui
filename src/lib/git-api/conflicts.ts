import type { ConflictFile, ConflictResolution, History } from "../git-types";
import { request } from "./transport";

export const conflictsApi = {
  getConflictFile: (file: string) => request<ConflictFile>("get_conflict_file", { file }),
  resolveConflict: (file: string, token: string, resolution: ConflictResolution) => request<History>("resolve_conflict_file", { file, token, resolution }),
};
