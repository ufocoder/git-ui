import { createSignal } from "solid-js";
import { t } from "./i18n.ts";

export type OperationNotice = { id: number; state: "running" | "success" | "error"; message: string };
export const [operationNotice, setOperationNotice] = createSignal<OperationNotice>();
let nextId = 0;
export function startOperation(message: string) {
  const id = ++nextId;
  setOperationNotice({ id, state: "running", message: t("notice01", { operation: message }) });
  return id;
}
export function finishOperation(id: number, message: string) {
  if (operationNotice()?.id === id) setOperationNotice({ id, state: "success", message: t("notice02", { operation: message }) });
}
export function explainOperationError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/unable to auto-detect email|author identity unknown|tell me who you are/i.test(text)) return t("notice05");
  if (/non-fast-forward|not possible to fast-forward|divergent branches|fetch first/i.test(text)) return t("notice06");
  if (/conflict|automatic merge failed/i.test(text)) return t("notice07");
  if (/authentication failed|permission denied \(publickey\)|could not read username/i.test(text)) return t("notice08");
  if (/could not resolve host|failed to connect|connection timed out|network is unreachable/i.test(text)) return t("notice09");
  if (/failed to sign|signing failed|couldn't load public key|no secret key/i.test(text)) return t("notice10");
  const firstLine = text.split("\n").find(line => line.trim()) ?? t("app06");
  return firstLine.length > 220 ? `${firstLine.slice(0, 220)}…` : firstLine;
}
export function failOperation(error: unknown) {
  setOperationNotice({ id: ++nextId, state: "error", message: explainOperationError(error) });
}
export function dismissOperation(id: number) {
  if (operationNotice()?.id === id) setOperationNotice(undefined);
}
