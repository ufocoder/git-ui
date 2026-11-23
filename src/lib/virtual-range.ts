export type VirtualRange = { start: number; end: number };

// End is exclusive. Geometry is shared; each view owns its row size and overscan.
export function virtualRange(count: number, top: number, height: number, rowHeight: number, overscan = 8): VirtualRange {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const stride = Number.isFinite(rowHeight) ? Math.max(1, rowHeight) : 1;
  const offset = Number.isFinite(top) ? top : 0;
  const viewport = Number.isFinite(height) ? Math.max(0, height) : 0;
  const buffer = Math.max(0, Math.floor(overscan));
  const start = Math.min(total, Math.max(0, Math.floor(offset / stride) - buffer));
  return { start, end: Math.min(total, Math.max(start, Math.ceil((offset + viewport) / stride) + buffer)) };
}

// Prefix offsets include the final bottom edge. Headers and folded context can
// have different heights from code lines, so a fixed stride is insufficient.
export function virtualOffsetRange(offsets: readonly number[], top: number, height: number, overscan = 8): VirtualRange {
  const count = Math.max(0, offsets.length - 1);
  const offset = Number.isFinite(top) ? top : 0;
  const viewport = Number.isFinite(height) ? Math.max(0, height) : 0;
  const buffer = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;
  if (!count || viewport === 0 || offset + viewport <= 0) return { start: 0, end: 0 };
  if (offset >= offsets[count]) return { start: count, end: count };
  function rowAt(y: number) {
    let low = 0, high = count;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid + 1] <= y) low = mid + 1;
      else high = mid;
    }
    return low;
  }
  const start = Math.max(0, rowAt(offset) - buffer);
  const end = Math.min(count, rowAt(offset + viewport) + 1 + buffer);
  return { start, end: Math.max(start, end) };
}
