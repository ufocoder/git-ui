export type GraphEdge = { from: number; to: number; top: boolean; bottom: boolean; color: number };
export type GraphRow = { column: number; color: number; edges: GraphEdge[] };

export function buildCommitGraph(commits: readonly { hash: string; parents: string[] }[]): { rows: GraphRow[]; width: number } {
  const lanes: string[] = [];
  let width = 1;
  let nextColor = 0;
  const colors = new Map<string, number>();
  const rows = commits.map(commit => {
    const continued = lanes.includes(commit.hash);
    if (!colors.has(commit.hash)) colors.set(commit.hash, nextColor++);
    const color = colors.get(commit.hash)!;
    if (!continued) lanes.push(commit.hash);
    const before = [...lanes];
    const column = before.indexOf(commit.hash);
    lanes.splice(column, 1);
    const parents = commit.parents;
    parents.forEach((parent, index) => {
      if (!colors.has(parent)) colors.set(parent, index === 0 ? color : nextColor++);
    });
    const active = new Set(lanes);
    const newParents = parents.filter(parent => !active.has(parent));
    lanes.splice(column, 0, ...newParents);
    const positions = new Map(lanes.map((hash, index) => [hash, index]));
    width = Math.max(width, before.length, lanes.length);
    const edges: GraphEdge[] = [];
    before.forEach((hash, from) => {
      if (hash === commit.hash) {
        if (continued) edges.push({ from, to: column, top: true, bottom: false, color });
      }
      else edges.push({ from, to: positions.get(hash)!, top: true, bottom: true, color: colors.get(hash)! });
    });
    parents.forEach(parent => edges.push({ from: column, to: positions.get(parent)!, top: false, bottom: true, color: parents[0] === parent ? color : colors.get(parent)! }));
    return { column, color, edges };
  });
  return { rows, width: Math.max(56, width * 16 + 16) };
}


// Vertical tangents keep connections smooth at row boundaries and commit nodes.
export function graphEdgePath(edge: GraphEdge, rowHeight: number): string {
  const x1 = 12 + edge.from * 16;
  const x2 = 12 + edge.to * 16;
  const y1 = edge.top ? 0 : rowHeight / 2;
  const y2 = edge.bottom ? rowHeight : rowHeight / 2;
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const middle = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
}
