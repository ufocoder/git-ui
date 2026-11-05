export type GraphEdge = { from: number; to: number; top: boolean; bottom: boolean };
export type GraphRow = { column: number; edges: GraphEdge[] };

export function buildCommitGraph(commits: readonly { hash: string; parents: string[] }[]): { rows: GraphRow[]; width: number } {
  const lanes: string[] = [];
  let width = 1;
  const rows = commits.map(commit => {
    const continued = lanes.includes(commit.hash);
    if (!continued) lanes.push(commit.hash);
    const before = [...lanes];
    const column = before.indexOf(commit.hash);
    lanes.splice(column, 1);
    const parents = commit.parents;
    const active = new Set(lanes);
    const newParents = parents.filter(parent => !active.has(parent));
    lanes.splice(column, 0, ...newParents);
    const positions = new Map(lanes.map((hash, index) => [hash, index]));
    width = Math.max(width, before.length, lanes.length);
    const edges: GraphEdge[] = [];
    before.forEach((hash, from) => {
      if (hash === commit.hash) {
        if (continued) edges.push({ from, to: column, top: true, bottom: false });
      }
      else edges.push({ from, to: positions.get(hash)!, top: true, bottom: true });
    });
    parents.forEach(parent => edges.push({ from: column, to: positions.get(parent)!, top: false, bottom: true }));
    return { column, edges };
  });
  return { rows, width: Math.max(56, width * 16 + 16) };
}
