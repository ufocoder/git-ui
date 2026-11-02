export type FileTreeNode<T> =
  | { kind: "directory"; name: string; path: string; children: FileTreeNode<T>[] }
  | { kind: "file"; name: string; path: string; value: T };

type Directory<T> = Extract<FileTreeNode<T>, { kind: "directory" }>;

// Git paths always use '/', including on Windows. Keep every path component.
export function buildFileTree<T extends { path: string }>(files: readonly T[], options: { compareFiles?: (a: T, b: T) => number; descending?: boolean } = {}): FileTreeNode<T>[] {
  const roots: FileTreeNode<T>[] = [];
  const directories = new Map<string, Directory<T>>();
  for (const file of files) {
    const parts = file.path.split("/");
    let children = roots;
    let path = "";
    parts.slice(0, -1).forEach(name => {
      path = path ? `${path}/${name}` : name;
      let directory = directories.get(path);
      if (!directory) {
        directory = { kind: "directory", name, path, children: [] };
        directories.set(path, directory);
        children.push(directory);
      }
      children = directory.children;
    });
    children.push({ kind: "file", name: parts[parts.length - 1], path: file.path, value: file });
  }
  const sort = (nodes: FileTreeNode<T>[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      const comparison = a.kind === "file" && b.kind === "file" && options.compareFiles
        ? options.compareFiles(a.value, b.value) : a.name.localeCompare(b.name);
      return options.descending ? -comparison : comparison;
    });
    nodes.forEach(node => { if (node.kind === "directory") sort(node.children); });
  };
  sort(roots);
  return roots;
}

export function filesInDirectory<T extends { path: string }>(files: readonly T[], directory: string): T[] {
  return files.filter(file => file.path.startsWith(`${directory}/`));
}
