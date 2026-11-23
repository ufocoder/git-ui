import { createDiffCache } from "./diff-cache";
import { git, type FileDiff, type WorktreeDiffScope } from "./git";

export const diffLoader = createDiffCache<FileDiff>(request => request.stash
  ? git.getStashDiff(request.commit, request.path)
  : git.getFileDiff(request.commit, request.path, request.scope as WorktreeDiffScope | undefined),
  value => 2 * (value.patch.length + value.commit.length + value.file.path.length + (value.file.old_path?.length ?? 0)) + 256);
