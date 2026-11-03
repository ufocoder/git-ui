import { t } from "~/lib/i18n";
import { Show, createMemo, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { terminalError } from "~/lib/terminal";
import { git, type TerminalLog } from "~/lib/git";

type TerminalPanelProps = { busy: boolean };
export default function TerminalPanel(props: TerminalPanelProps) {
  const [log, setLog] = createSignal<TerminalLog | null>(null);
  const [error, setError] = createSignal("");
  const displayedLog = createMemo<TerminalLog | null>(() => {
    const failure = terminalError();
    const native = log();
    if (!failure) return native;
    if (native?.status === "error" && native.output.trim() && failure.message.includes(native.output.trim())) return native;
    return { id: -failure.id, command: failure.operation, output: failure.message, status: "error", exit_code: null };
  });
  let active = true;
  let fetching = false;
  let output!: HTMLDivElement;
  async function refresh() {
    if (fetching || !active) return;
    fetching = true;
    try {
      const latest = await git.getTerminalLog();
      if (!active) return;
      setError("");
      const previous = log();
      if (latest?.id !== previous?.id || latest?.status !== previous?.status || latest?.output !== previous?.output) setLog(latest);
    } catch (e) { if (active) setError(String(e)); }
    finally { fetching = false; }
  }
  createEffect(() => { void props.busy; void refresh(); });
  onMount(() => {
    const timer = window.setInterval(() => void refresh(), 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  onCleanup(() => { active = false; });
  createEffect(() => {
    const entry = displayedLog();
    if (entry) queueMicrotask(() => { if (active && output) output.scrollTop = output.scrollHeight; });
  });
  return <section class="flex h-full min-h-0 flex-col bg-muted/30" aria-label={t("log01")}>
    <header class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-xs">
      <h2 class="font-semibold">{t("nav11")}</h2>
      <span role="status" class="text-muted-foreground">{displayedLog()?.status === "running" ? t("log02") : displayedLog() ? (displayedLog()?.status === "error" && displayedLog()?.exit_code === null ? t("log03") : t("log04", { p1: displayedLog()?.exit_code ?? "—" })) : ""}</span>
    </header>
    <div ref={element => { output = element; }} class="min-h-0 flex-1 cursor-text select-text overflow-auto px-4 py-3 font-mono text-xs leading-5 [&_*]:select-text" tabindex="0" aria-label={t("log05")}>
      <Show when={error()}><p class="text-destructive">{error()}</p></Show>
      <Show when={displayedLog()} fallback={<p class="text-muted-foreground">{t("log06")}</p>}>{entry => <>
        <pre class="whitespace-pre-wrap break-all font-semibold">$ {entry().command}</pre>
        <pre class={`whitespace-pre-wrap break-all ${entry().status === "error" ? "text-destructive" : ""}`}>{entry().output || (entry().status === "running" ? t("log07") : t("log08"))}</pre>
      </>}</Show>
    </div>
  </section>;
}
