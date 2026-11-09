import { createSignal } from "solid-js";
import type { RewriteRecovery } from "./git-types.ts";
import { t } from "./i18n.ts";

export type OperationNotice = { id: number; state: "running" | "success" | "error"; message: string; recovery?: RewriteRecovery };
export const [operationNotice, setOperationNotice] = createSignal<OperationNotice>();
let nextId = 0;
export function startOperation(message: string) {
  const id = ++nextId;
  setOperationNotice({ id, state: "running", message: t("notice.running", { operation: message }) });
  return id;
}
export function finishOperation(id: number, message: string) {
  if (operationNotice()?.id === id) setOperationNotice({ id, state: "success", message: t("notice.done", { operation: message }) });
}
export function offerHistoryRecovery(recovery: RewriteRecovery) {
  setOperationNotice(notice => notice?.state === "success" ? { ...notice, recovery } : notice);
}
export function explainOperationError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/unable to auto-detect email|author identity unknown|tell me who you are/i.test(text)) return t("notice.identity");
  if (/non-fast-forward|not possible to fast-forward|divergent branches|fetch first/i.test(text)) return t("notice.diverged");
  if (/conflict|automatic merge failed/i.test(text)) return t("notice.conflicts");
  if (/authentication failed|permission denied \(publickey\)|could not read username/i.test(text)) return t("notice.auth");
  if (/could not resolve host|failed to connect|connection timed out|network is unreachable/i.test(text)) return t("notice.network");
  if (/failed to sign|signing failed|couldn't load public key|no secret key/i.test(text)) return t("notice.signing");
  const firstLine = text.split("\n").find(line => line.trim()) ?? t("app.action-failed");
  return firstLine.length > 220 ? `${firstLine.slice(0, 220)}…` : firstLine;
}
export function failOperation(error: unknown) {
  setOperationNotice({ id: ++nextId, state: "error", message: explainOperationError(error) });
}
export function dismissOperation(id: number) {
  if (operationNotice()?.id === id) setOperationNotice(undefined);
}
