import { createConflictAnalyzer, type ConflictAnalysis, type ConflictAnalysisRequest, type ConflictAnalysisResponse, type ConflictSource } from "./conflict-model.ts";
import { latestRequest } from "./latest-request.ts";

export type AnalysisPort = { send: (request: ConflictAnalysisRequest) => void; dispose: () => void };
type Connect = (receive: (response: ConflictAnalysisResponse) => void, fail: () => void) => AnalysisPort;

export function createConflictAnalysisClient(
  publish: (analysis: ConflictAnalysis | undefined, source: ConflictSource | undefined) => void,
  connect: Connect,
  delay = 150,
) {
  const requests = latestRequest();
  let source: ConflictSource | undefined, text = "", disposed = false;
  let port: AnalysisPort | undefined;
  let fallback = createConflictAnalyzer();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const receive = (response: ConflictAnalysisResponse) => {
    if (requests.isCurrent(response.id)) publish(response.analysis, source);
  };
  function run(request: ConflictAnalysisRequest) {
    if (disposed) return;
    if (port) {
      try { port.send(request); } catch { fail(); }
    } else receive(fallback(request));
  }
  function fail() {
    port?.dispose(); port = undefined;
    clearTimeout(timer);
    if (source && !disposed) {
      fallback = createConflictAnalyzer();
      run({ id: requests.next(), source, text });
    }
  }
  try { port = connect(receive, fail); } catch { /* Worker unavailable; use the same analyzer locally. */ }
  return {
    setSource(next: ConflictSource | undefined, value: string) {
      if (disposed) return;
      clearTimeout(timer);
      source = next; text = value;
      const id = requests.next();
      publish(undefined, source);
      if (source) run({ id, source, text });
    },
    setText(value: string) {
      if (disposed) return;
      clearTimeout(timer);
      text = value;
      const id = requests.next();
      if (source) timer = setTimeout(() => run({ id, text }), delay);
    },
    dispose() { disposed = true; clearTimeout(timer); requests.dispose(); port?.dispose(); },
  };
}
