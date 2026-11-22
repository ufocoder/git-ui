import { changedLineEdits, conflictMarkerBlocks, editLineBlocks, textLines, type LineBlock, type LineEdit } from "./conflict-lines.ts";

export type ConflictSource = { base: string; ours: string; theirs: string };
export type SourceAnalysis = { edits: LineEdit[]; changes: LineBlock[]; count: number };
export type ConflictSources = { ours: SourceAnalysis; theirs: SourceAnalysis; regions: { start: number; end: number }[] };
export type ConflictAnalysis = { ours: LineBlock[]; theirs: LineBlock[]; result: LineBlock[]; markers: LineBlock[]; targets: { ours: LineBlock; theirs: LineBlock; result: LineBlock }[] };

function analyze(base: string, text: string): SourceAnalysis {
  const edits = changedLineEdits(base, text);
  const count = textLines(text).length;
  return { edits, changes: editLineBlocks(edits, count), count };
}

export function analyzeConflictSources(source: ConflictSource): ConflictSources {
  const ours = analyze(source.base, source.ours), theirs = analyze(source.base, source.theirs);
  const regions: ConflictSources["regions"] = [];
  for (const edit of [...ours.edits, ...theirs.edits].sort((a, b) => a.baseStart - b.baseStart || a.baseEnd - b.baseEnd)) {
    const previous = regions[regions.length - 1];
    if (previous && edit.baseStart <= previous.end) previous.end = Math.max(previous.end, edit.baseEnd);
    else regions.push({ start: edit.baseStart, end: edit.baseEnd });
  }
  return { ours, theirs, regions };
}

// Map the same ancestor interval into each version, including insertions and
// deletion anchors. Independent block indices cannot provide this alignment.
function mapRegion(region: { start: number; end: number }, analysis: SourceAnalysis): LineBlock {
  function boundary(position: number, end: boolean) {
    let delta = 0;
    for (const edit of analysis.edits) {
      if (position < edit.baseStart || (position === edit.baseStart && !end)) break;
      if (position < edit.baseEnd || (position === edit.baseEnd && end)) return end ? edit.end : edit.start;
      delta = edit.end - edit.baseEnd;
    }
    return position + delta;
  }
  const last = Math.max(0, analysis.count - 1);
  const start = Math.max(0, Math.min(last, boundary(region.start, false)));
  return { start, end: Math.max(start, Math.min(last, boundary(region.end, true) - 1)) };
}

export function analyzeConflictResult(base: string, text: string, sources: ConflictSources): ConflictAnalysis {
  const result = analyze(base, text);
  const markers = conflictMarkerBlocks(text);
  // If the source versions agree, navigate edits made only in the result.
  const regions = sources.regions.length ? sources.regions : result.edits.map(edit => ({ start: edit.baseStart, end: edit.baseEnd }));
  return {
    ours: sources.ours.changes, theirs: sources.theirs.changes, result: result.changes, markers,
    targets: regions.map(region => ({ ours: mapRegion(region, sources.ours), theirs: mapRegion(region, sources.theirs), result: mapRegion(region, result) })),
  };
}

export type ConflictAnalysisRequest = { id: number; source?: ConflictSource; text: string };
export type ConflictAnalysisResponse = { id: number; analysis: ConflictAnalysis };

// Shared by the browser worker and deterministic scenario tests. Source diffs
// are cached across result edits and replaced on every file switch.
export function createConflictAnalyzer() {
  let base = "", sources: ConflictSources | undefined;
  return (request: ConflictAnalysisRequest): ConflictAnalysisResponse => {
    if (request.source) { base = request.source.base; sources = analyzeConflictSources(request.source); }
    if (!sources) throw new Error("Conflict source is not initialized");
    return { id: request.id, analysis: analyzeConflictResult(base, request.text, sources) };
  };
}
