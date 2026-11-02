import { Show, createEffect, onCleanup } from "solid-js";
import { operationNotice, dismissOperation } from "~/lib/operation-feedback";
import { t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";

export default function OperationStatus(props: { onOpenTerminal: () => void }) {
  createEffect(() => {
    const notice = operationNotice();
    if (notice?.state !== "success") return;
    const timer = window.setTimeout(() => dismissOperation(notice.id), 5000);
    onCleanup(() => window.clearTimeout(timer));
  });
  return <Show when={operationNotice()}>{notice => <div class="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-1.5 text-xs" role={notice().state === "error" ? "alert" : "status"}>
    <span aria-hidden="true" class={notice().state === "error" ? "text-destructive" : "text-muted-foreground"}>{notice().state === "running" ? "…" : notice().state === "error" ? "!" : "✓"}</span>
    <span class="min-w-0 flex-1 break-words" classList={{ "text-destructive": notice().state === "error" }}>{notice().message}</span>
    <Show when={notice().state === "error"}><Button size="sm" variant="ghost" class="h-7 text-xs" onClick={props.onOpenTerminal}>{t("notice03")}</Button></Show>
    <Show when={notice().state !== "running"}><Button size="icon" variant="ghost" class="size-6 shrink-0" aria-label={t("notice04")} title={t("notice04")} onClick={() => dismissOperation(notice().id)}>×</Button></Show>
  </div>}</Show>;
}
