type ReferenceKind = "branches" | "tags";
const key = (project: string, kind: ReferenceKind) => `git-ui.pinned-${kind}.v1:${project}`;

function readPinnedReferences(project: string, kind: ReferenceKind): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(project, kind)) ?? "null");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []);
  } catch { return new Set(); }
}
function savePinnedReferences(project: string, branches: ReadonlySet<string>, kind: ReferenceKind) {
  try { localStorage.setItem(key(project, kind), JSON.stringify([...branches])); } catch { /* Optional sidebar preference. */ }
}

export const readPinnedBranches = (project: string) => readPinnedReferences(project, "branches");
export const savePinnedBranches = (project: string, names: ReadonlySet<string>) => savePinnedReferences(project, names, "branches");
export const readPinnedTags = (project: string) => readPinnedReferences(project, "tags");
export const savePinnedTags = (project: string, names: ReadonlySet<string>) => savePinnedReferences(project, names, "tags");

// Preserve the active sort inside each group; pins remain first even during search.
export function orderReferences(items: readonly string[], isPinned: (name: string) => boolean, matches: ReadonlySet<string>): string[] {
  const groups: string[][] = [[], [], [], []];
  for (const item of items) groups[(isPinned(item) ? 0 : 2) + (matches.has(item) ? 0 : 1)].push(item);
  return groups.flat();
}

export function highlightedRanges<T>(items: readonly T[], matches: ReadonlySet<T>): { start: number; length: number }[] {
  const ranges: { start: number; length: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!matches.has(items[i])) continue;
    const previous = ranges[ranges.length - 1];
    if (previous && previous.start + previous.length === i) previous.length++;
    else ranges.push({ start: i, length: 1 });
  }
  return ranges;
}
