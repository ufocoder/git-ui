import { createEffect, createSignal, onCleanup, on } from "solid-js";
import { createConflictAnalysisClient } from "~/lib/conflict-analysis-client";
import type { ConflictAnalysis, ConflictSource } from "~/lib/conflict-model";

const empty: ConflictAnalysis = { ours: [], theirs: [], result: [], markers: [], targets: [] };

export function createConflictAnalysis(source: () => ConflictSource | undefined, text: () => string) {
  const [analysis, setAnalysis] = createSignal(empty);
  const [analyzedSource, setAnalyzedSource] = createSignal<ConflictSource>();
  const client = createConflictAnalysisClient((result, current) => {
    setAnalysis(result ?? empty); setAnalyzedSource(current);
  }, (receive, fail) => {
    const worker = new Worker(new URL("./conflict-analysis.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => receive(event.data);
    worker.onerror = fail;
    return { send: request => worker.postMessage(request), dispose: () => worker.terminate() };
  });
  createEffect(on(source, current => client.setSource(current, text())));
  createEffect(on(text, value => client.setText(value), { defer: true }));
  onCleanup(client.dispose);
  return () => analyzedSource() === source() ? analysis() : empty;
}
