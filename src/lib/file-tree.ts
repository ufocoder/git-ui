export type FileTreeNode<T> =
  | { kind: "directory"; name: string; path: string; children: FileTreeNode<T>[] }
  | { kind: "file"; name: string; path: string; value: T };

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

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
        ? options.compareFiles(a.value, b.value) : naturalOrder.compare(a.name, b.name) || a.name.localeCompare(b.name);
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

export function flattenFileTree<T>(nodes: FileTreeNode<T>[], closed: ReadonlySet<string>) {
  const rows: { node: FileTreeNode<T>; depth: number; last: boolean; guides: number[] }[] = [];
  function append(level: FileTreeNode<T>[], depth: number, guides: number[]) {
    level.forEach((node, index) => {
      const last = index === level.length - 1;
      rows.push({ node, depth, last, guides });
      if (node.kind === "directory" && !closed.has(node.path)) {
        // Keep ancestor trunks on descendant rows, even when the parent is outside the viewport.
        append(node.children, depth + 1, depth > 0 && !last ? [...guides, depth] : guides);
      }
    });
  }
  append(nodes, 0, []);
  return rows;
}

export function compactFileTree<T>(nodes: FileTreeNode<T>[]): FileTreeNode<T>[] {
  return nodes.map(node => {
    if (node.kind === "file") return node;
    let name = node.name, tail = node;
    while (tail.children.length === 1 && tail.children[0].kind === "directory") {
      tail = tail.children[0];
      name += "/" + tail.name;
    }
    return { ...tail, name, children: compactFileTree(tail.children) };
  });
}
