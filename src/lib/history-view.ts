export function preservedSelection<T extends { hash: string }>(previous: T | undefined, rows: readonly T[]): T | undefined {
  return previous && rows.some(row => row.hash === previous.hash) ? previous : rows[0];
}

export function anchoredScroll(rows: readonly { hash: string }[], anchor: string | undefined, offset: number, fallback: number, rowHeight: number): number {
  const index = anchor ? rows.findIndex(row => row.hash === anchor) : -1;
  return index < 0 ? fallback : Math.max(0, index * rowHeight + offset);
}
