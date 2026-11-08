import { failOperation } from "./operation-feedback";
import { t } from "~/lib/i18n";
import { createSignal } from "solid-js";

export type TerminalError = { id: number; operation: string; message: string };
const [terminalError, setTerminalError] = createSignal<TerminalError | null>(null);
let nextId = 0;
export { terminalError };

export function reportTerminalError(error: unknown, operation = t("terminal.app-error")) {
  failOperation(error);
  setTerminalError({ id: ++nextId, operation, message: error instanceof Error ? error.message : String(error) });
}
export function clearTerminalError() { setTerminalError(null); }
