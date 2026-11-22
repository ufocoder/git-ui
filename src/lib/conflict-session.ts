import { latestRequest } from "./latest-request.ts";
import type { ConflictFile, ConflictResolution, History } from "./git-types.ts";

type Transport = {
  getConflictFile: (path: string) => Promise<ConflictFile>;
  resolveConflict: (path: string, token: string, resolution: ConflictResolution) => Promise<History>;
};

export function conflictResolution(choice: "manual" | "ours" | "theirs", text: string): ConflictResolution {
  return choice === "manual" ? { kind: "manual", content: text } : { kind: choice };
}

export function createConflictSession(transport: Transport) {
  const loads = latestRequest();
  let disposed = false;
  return {
    async load(path: string) {
      const ticket = loads.next();
      const file = await transport.getConflictFile(path);
      return loads.isCurrent(ticket) ? file : undefined;
    },
    invalidate() { loads.next(); },
    async save(file: ConflictFile, choice: "manual" | "ours" | "theirs", text: string) {
      // Snapshot the resolution before awaiting; analysis never owns draft text.
      const history = await transport.resolveConflict(file.file.path, file.token, conflictResolution(choice, text));
      return disposed ? undefined : history;
    },
    dispose() { disposed = true; loads.dispose(); },
  };
}
