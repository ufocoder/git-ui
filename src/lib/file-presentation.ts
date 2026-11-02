export type FileView = "tree" | "list";
export type FileSort = "path" | "name" | "status";
export type FilePresentation = { view: FileView; sort: FileSort; descending: boolean };
const defaults: FilePresentation = { view: "tree", sort: "path", descending: false };
const storageKey = "git-ui.changes-presentation";

export function readFilePresentation(): FilePresentation {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return {
      view: value?.view === "list" ? "list" : "tree",
      sort: ["path", "name", "status"].includes(value?.sort) ? value.sort : "path",
      descending: value?.descending === true,
    };
  } catch { return { ...defaults }; }
}

export function saveFilePresentation(value: FilePresentation) {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Optional display preference. */ }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export function compareChangedFiles(a: { path: string; status: string }, b: { path: string; status: string }, sort: FileSort): number {
  const byPath = () => collator.compare(a.path, b.path) || a.path.localeCompare(b.path);
  if (sort === "name") return collator.compare(a.path.split("/").pop()!, b.path.split("/").pop()!) || byPath();
  if (sort === "status") {
    const order = ["U", "A", "M", "R", "C", "D", "?"];
    const rank = (status: string) => { const index = order.indexOf(status[0]); return index < 0 ? order.length : index; };
    return rank(a.status) - rank(b.status) || byPath();
  }
  return byPath();
}
