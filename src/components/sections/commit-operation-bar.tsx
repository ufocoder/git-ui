import { Show, createSignal } from "solid-js";
import { t } from "~/lib/i18n";
import type { CommitOperation, History } from "~/lib/git";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";

export default function CommitOperationBar(props: { history: History; disabled: boolean; onShowConflicts: () => void; onRefresh: () => Promise<void>; onExecute: (head: string, branch: string, action: CommitOperation) => Promise<void> }) {
  const [confirmation, setConfirmation] = createSignal<{ kind: "abort" | "skip"; head: string; branch: string }>();
  const [pending, setPending] = createSignal(false);
  async function execute(head: string, branch: string, action: CommitOperation) {
    if (props.disabled || pending()) return;
    setPending(true);
    try { await props.onExecute(head, branch, action); }
    catch { /* The terminal displays operation errors. */ }
    finally { setPending(false); setConfirmation(undefined); }
  }
  function confirm(kind: "abort" | "skip") { setConfirmation({ kind, head: props.history.tip, branch: props.history.current_branch }); }
  return <>
    <Show when={props.history.operation}>{operation => <section class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3" aria-label={t("op27")}>
      <div class="min-w-0 space-y-1">
        <p class="text-sm font-medium">{t("op21", { kind: operation().kind, sha: operation().commit.slice(0, 8) })}</p>
        <p class="text-xs text-muted-foreground">{operation().conflicts ? t("op22", { count: operation().conflicts }) : (operation().staged || operation().kind === "merge") ? t("op23") : t("op24")}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Show when={operation().conflicts > 0}><Button size="sm" variant="secondary" disabled={props.disabled || pending()} onClick={props.onShowConflicts}>{t("conf01")}</Button></Show>
        <Button size="sm" variant="ghost" disabled={props.disabled || pending()} onClick={() => void props.onRefresh()}>{t("op28")}</Button>
        <Button size="sm" variant="outline" disabled={props.disabled || pending()} onClick={() => confirm("abort")}>{t("op12")}</Button>
        <Show when={operation().kind !== "merge" && !operation().conflicts && !operation().staged}>
          <Button size="sm" variant="outline" disabled={props.disabled || pending()} onClick={() => confirm("skip")}>{t("op13")}</Button>
        </Show>
        <Button size="sm" disabled={props.disabled || pending() || Boolean(operation().conflicts) || (!operation().staged && operation().kind !== "merge")}
          onClick={() => void execute(props.history.tip, props.history.current_branch, { kind: "continue" })}>{t("op11")}</Button>
      </div>
    </section>}</Show>
    <Dialog open={Boolean(confirmation())} onOpenChange={open => { if (!open && !pending()) setConfirmation(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{confirmation()?.kind === "abort" ? t("op12") : t("op13")}</DialogTitle>
          <DialogDescription>{confirmation()?.kind === "abort" ? t("op25") : t("op26")}</DialogDescription></DialogHeader>
        <DialogFooter class="gap-2">
          <Button variant="outline" disabled={pending()} onClick={() => setConfirmation(undefined)}>{t("add09")}</Button>
          <Button variant="destructive" disabled={pending()} onClick={() => { const action = confirmation(); if (action) void execute(action.head, action.branch, { kind: action.kind, confirmed: true }); }}>{t("op11")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
