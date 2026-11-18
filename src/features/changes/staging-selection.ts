import type { CommitFile, WorktreeDiffScope } from "../../lib/git-types.ts";

type StagingFile = Pick<CommitFile, "staged" | "partially_staged">;
export function stagingSelection(files: readonly StagingFile[]) {
  const checked = files.length > 0 && files.every(file => file.staged && !file.partially_staged);
  return { checked, indeterminate: !checked && files.some(file => file.staged) };
}
export function hasDiffScope(files: readonly StagingFile[], scope: WorktreeDiffScope) {
  return files.some(file => scope === "staged" ? file.staged : !file.staged || file.partially_staged);
}
export function selectDiffScope(files: readonly StagingFile[], preferred?: WorktreeDiffScope): WorktreeDiffScope {
  if (preferred && hasDiffScope(files, preferred)) return preferred;
  return hasDiffScope(files, "unstaged") ? "unstaged" : "staged";
}
