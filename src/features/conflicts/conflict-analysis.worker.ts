import { createConflictAnalyzer, type ConflictAnalysisRequest } from "../../lib/conflict-model";

const analyze = createConflictAnalyzer();
self.onmessage = (event: MessageEvent<ConflictAnalysisRequest>) => self.postMessage(analyze(event.data));
