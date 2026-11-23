import { buildFileTree, type FileTreeNode } from "./file-tree.ts";
import type { CommitFile } from "./git-types.ts";

export type DirectorySelection = {
  checked: boolean;
  indeterminate: boolean;
  count: number;
  stagedCount: number;
  fullyStagedCount: number;
  files: () => CommitFile[];
};

export function indexFileSelection(files: readonly CommitFile[]) {
  const nodes = buildFileTree(files);
  const byPath = new Map<string, CommitFile>();
  const directories = new Map<string, DirectorySelection>();
  const ordered: CommitFile[] = [];
  function visit(children: FileTreeNode<CommitFile>[]): DirectorySelection {
    const start = ordered.length;
    let stagedCount = 0, fullyStagedCount = 0;
    for (const node of children) {
      if (node.kind === "directory") {
        const child = visit(node.children);
        directories.set(node.path, child);
        stagedCount += child.stagedCount; fullyStagedCount += child.fullyStagedCount;
      } else {
        const file = node.value;
        byPath.set(file.path, file); ordered.push(file);
        if (file.staged) stagedCount++;
        if (file.staged && !file.partially_staged) fullyStagedCount++;
      }
    }
    const end = ordered.length, count = end - start;
    const checked = count > 0 && fullyStagedCount === count;
    return { checked, indeterminate: !checked && stagedCount > 0, count, stagedCount, fullyStagedCount,
      // Materialize only the requested subtree, never rescan unrelated files.
      files: () => ordered.slice(start, end) };
  }
  const root = visit(nodes);
  return { nodes, byPath, directories, root, filesIn: (path: string) => directories.get(path)?.files() ?? [] };
}
export type FileSelectionIndex = ReturnType<typeof indexFileSelection>;
