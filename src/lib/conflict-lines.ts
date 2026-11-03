export type LineBlock = { start: number; end: number };
export function textLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function mergeLineBlocks(blocks: LineBlock[]): LineBlock[] {
  const result: LineBlock[] = [];
  for (const block of blocks.sort((a, b) => a.start - b.start)) {
    const previous = result[result.length - 1];
    if (previous && block.start <= previous.end + 1) previous.end = Math.max(previous.end, block.end);
    else result.push({ ...block });
  }
  return result;
}

// Patience anchors avoid quadratic work on large files; small repeated regions
// use LCS. A bounded fallback highlights the remaining region as one block.
export function changedLineBlocks(base: string, text: string): LineBlock[] {
  const left = textLines(base), right = textLines(text);
  const blocks: LineBlock[] = [];
  let budget = 500_000;
  const mark = (start: number, end: number) => {
    const last = Math.max(0, right.length - 1);
    blocks.push({ start: Math.min(start, last), end: Math.min(Math.max(start, end - 1), last) });
  };
  function compare(a: number, b: number, c: number, d: number, depth: number) {
    while (a < b && c < d && left[a] === right[c]) { a++; c++; }
    while (a < b && c < d && left[b - 1] === right[d - 1]) { b--; d--; }
    if (a === b && c === d) return;
    if (a === b || c === d || depth > 32) { mark(c, d); return; }
    const cells = (b - a + 1) * (d - c + 1);
    if (cells <= budget) {
      budget -= cells;
      const width = d - c + 1;
      const table = new Uint32Array(cells);
      for (let i = b - a - 1; i >= 0; i--) for (let j = d - c - 1; j >= 0; j--) {
        table[i * width + j] = left[a + i] === right[c + j] ? 1 + table[(i + 1) * width + j + 1] : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
      let i = 0, j = 0, start = -1;
      while (i < b - a || j < d - c) {
        if (i < b - a && j < d - c && left[a + i] === right[c + j]) {
          if (start !== -1) { mark(c + start, c + j); start = -1; }
          i++; j++;
        } else {
          if (start === -1) start = j;
          if (i < b - a && (j === d - c || table[(i + 1) * width + j] >= table[i * width + j + 1])) i++;
          else j++;
        }
      }
      if (start !== -1) mark(c + start, c + j);
      return;
    }
    const uniqueLeft = new Map<string, number>(), uniqueRight = new Map<string, number>();
    for (let i = a; i < b; i++) uniqueLeft.set(left[i], uniqueLeft.has(left[i]) ? -1 : i);
    for (let j = c; j < d; j++) uniqueRight.set(right[j], uniqueRight.has(right[j]) ? -1 : j);
    const pairs: [number, number][] = [];
    for (let i = a; i < b; i++) {
      const j = uniqueRight.get(left[i]);
      if (uniqueLeft.get(left[i]) === i && j !== undefined && j >= 0) pairs.push([i, j]);
    }
    const tails: number[] = [], previous: number[] = [];
    for (let i = 0; i < pairs.length; i++) {
      let low = 0, high = tails.length;
      while (low < high) { const mid = (low + high) >>> 1; if (pairs[tails[mid]][1] < pairs[i][1]) low = mid + 1; else high = mid; }
      previous[i] = low ? tails[low - 1] : -1;
      tails[low] = i;
    }
    if (!tails.length) { mark(c, d); return; }
    const anchors: [number, number][] = [];
    for (let i = tails[tails.length - 1]; i >= 0; i = previous[i]) anchors.push(pairs[i]);
    anchors.reverse();
    for (const [i, j] of anchors) { compare(a, i, c, j, depth + 1); a = i + 1; c = j + 1; }
    compare(a, b, c, d, depth + 1);
  }
  compare(0, left.length, 0, right.length, 0);
  return mergeLineBlocks(blocks);
}

export function conflictMarkerBlocks(text: string): LineBlock[] {
  const lines = textLines(text), blocks: LineBlock[] = [];
  let start = -1;
  lines.forEach((line, index) => {
    if (/^<{7,}(?: |$)/.test(line)) start = index;
    if (/^>{7,}(?: |$)/.test(line) && start >= 0) { blocks.push({ start, end: index }); start = -1; }
  });
  if (start >= 0) blocks.push({ start, end: Math.max(start, lines.length - 1) });
  return blocks;
}
