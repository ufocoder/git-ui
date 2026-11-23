import type { DiffRow } from "./diff.ts";

export function diffLayout(rows: readonly DiffRow[], lineHeight: number, headerHeight: number) {
  const offsets = [0], hunkRows: number[] = [];
  let leftColumns = 1, rightColumns = 1, headerColumns = 1;
  // Reserve horizontal space for offscreen lines as well. Tabs and wide text
  // must not cause the horizontal scrollbar to shrink while scrolling.
  const columns = (text: string) => text.replace(/\t/g, "        ").replace(/[^\u0020-\u00ff]/gu, "  ").length;
  rows.forEach((row, index) => {
    offsets.push(offsets[index] + (row.kind === "line" ? lineHeight : headerHeight));
    if (row.kind === "header") { hunkRows[row.hunk] = index; headerColumns = Math.max(headerColumns, columns(row.text)); }
    if (row.kind === "line") {
      leftColumns = Math.max(leftColumns, columns(row.left?.text ?? ""));
      rightColumns = Math.max(rightColumns, columns(row.right?.text ?? ""));
    }
  });
  return { offsets, hunkRows, leftColumns, rightColumns, headerColumns, total: offsets[rows.length] };
}

export function correspondingDiffRow(rows: readonly DiffRow[], previous: DiffRow | undefined, fallback: number) {
  if (!previous) return 0;
  const index = rows.findIndex(row => {
    if (previous.kind === "header") return row.kind === "header" && row.hunk === previous.hunk;
    if (previous.kind === "fold") return row.kind === "fold" && row.id === previous.id;
    if (row.kind !== "line") return false;
    return (previous.left?.oldLine != null && row.left?.oldLine === previous.left.oldLine)
      || (previous.right?.newLine != null && row.right?.newLine === previous.right.newLine);
  });
  return index < 0 ? Math.min(fallback, Math.max(0, rows.length - 1)) : index;
}
