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
