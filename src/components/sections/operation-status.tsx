import { Show, createEffect, onCleanup } from "solid-js";
import { operationNotice, dismissOperation } from "~/lib/operation-feedback";
import { t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";

export default function OperationStatus(props: { onOpenTerminal?: () => void }) {
  createEffect(() => {
    const notice = operationNotice();
    if (notice?.state !== "success") return;
    const timer = window.setTimeout(() => dismissOperation(notice.id), 5000);
    onCleanup(() => window.clearTimeout(timer));
  });
  return <Show when={operationNotice()}>{notice => <div class="fixed bottom-4 right-4 z-40 flex max-w-[min(28rem,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md" role={notice().state === "error" ? "alert" : "status"}>
    <Show when={notice().state === "running"} fallback={
      <span aria-hidden="true" class={notice().state === "error" ? "text-destructive" : "text-success-foreground"}>{notice().state === "error" ? "!" : "✓"}</span>
    }>
      <span aria-hidden="true" class="size-3 shrink-0 rounded-full border border-current border-r-transparent text-muted-foreground motion-safe:animate-spin" />
    </Show>
    <span class="min-w-0 flex-1 break-words" classList={{ "text-destructive": notice().state === "error" }}>{notice().message}</span>
    <Show when={notice().state === "error" && props.onOpenTerminal}><Button size="sm" variant="ghost" class="h-7 text-xs" onClick={props.onOpenTerminal}>{t("notice03")}</Button></Show>
    <Show when={notice().state !== "running"}><Button size="icon" variant="ghost" class="size-6 shrink-0" aria-label={t("notice04")} title={t("notice04")} onClick={() => dismissOperation(notice().id)}>×</Button></Show>
  </div>}</Show>;
}
