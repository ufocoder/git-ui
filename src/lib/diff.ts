export type DiffLine = { kind: "context" | "add" | "remove" | "meta"; text: string; oldLine: number | null; newLine: number | null };
export type DiffHunk = { header: string; lines: DiffLine[] };
export type ParsedDiff = { metadata: string[]; hunks: DiffHunk[] };
export type DiffRow = { kind: "header"; text: string; hunk: number } | { kind: "fold"; id: string; count: number } | { kind: "line"; left: DiffLine | null; right: DiffLine | null };

export function parseDiff(patch: string): ParsedDiff {
  const result: ParsedDiff = { metadata: [], hunks: [] };
  let hunk: DiffHunk | undefined;
  let oldLine = 0, newLine = 0;
  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      oldLine = Number(header[1]); newLine = Number(header[2]);
      hunk = { header: line, lines: [] }; result.hunks.push(hunk);
    } else if (hunk && /^[ +\-\\]/.test(line)) {
      const kind = line[0] === "+" ? "add" : line[0] === "-" ? "remove" : line[0] === " " ? "context" : "meta";
      hunk.lines.push({ kind, text: kind === "meta" ? line : line.slice(1), oldLine: kind === "context" || kind === "remove" ? oldLine++ : null, newLine: kind === "context" || kind === "add" ? newLine++ : null });
    } else { hunk = undefined; result.metadata.push(line); }
  }
  return result;
}

export function diffRows(parsed: ParsedDiff, split: boolean, collapse: boolean, expanded: ReadonlySet<string>): DiffRow[] {
  const result: DiffRow[] = [];
  parsed.hunks.forEach((hunk, hunkIndex) => {
    result.push({ kind: "header", text: hunk.header, hunk: hunkIndex });
    for (let index = 0; index < hunk.lines.length;) {
      const line = hunk.lines[index];
      if (line.kind === "context") {
        let end = index + 1;
        while (hunk.lines[end]?.kind === "context") end++;
        const count = end - index, id = `${hunkIndex}:${index}`;
        if (collapse && count > 6 && !expanded.has(id)) {
          for (let offset = 0; offset < 3; offset++) result.push({ kind: "line", left: hunk.lines[index + offset], right: hunk.lines[index + offset] });
          result.push({ kind: "fold", id, count: count - 6 });
          for (let offset = end - 3; offset < end; offset++) result.push({ kind: "line", left: hunk.lines[offset], right: hunk.lines[offset] });
        } else for (let offset = index; offset < end; offset++) result.push({ kind: "line", left: hunk.lines[offset], right: hunk.lines[offset] });
        index = end;
      } else if (split && (line.kind === "add" || line.kind === "remove")) {
        const removed: DiffLine[] = [], added: DiffLine[] = [];
        while (hunk.lines[index]?.kind === "remove" || hunk.lines[index]?.kind === "add") {
          const next = hunk.lines[index++]; (next.kind === "remove" ? removed : added).push(next);
        }
        for (let offset = 0; offset < Math.max(removed.length, added.length); offset++) result.push({ kind: "line", left: removed[offset] ?? null, right: added[offset] ?? null });
      } else {
        result.push({ kind: "line", left: line.kind === "add" ? null : line, right: line.kind === "remove" ? null : line });
        index++;
      }
    }
  });
  return result;
}
