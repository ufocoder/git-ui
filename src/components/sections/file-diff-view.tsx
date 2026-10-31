import { t } from "~/lib/i18n";
import { For, Show } from "solid-js";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { WORKTREE, type FileDiff } from "~/lib/git";

export default function FileDiffView(props: { diff: FileDiff }) {
  function lineClass(line: string) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) return "bg-muted font-semibold";
    if (line.startsWith("+")) return "bg-success text-success-foreground";
    if (line.startsWith("-")) return "bg-error text-error-foreground";
    if (line.startsWith("@@")) return "bg-info text-info-foreground";
    return "";
  }
  return <section class="flex h-full min-h-0 min-w-0 flex-col gap-3" aria-label={t("diff01")}>
      <header class="shrink-0 space-y-2">
        <div class="flex items-start gap-2"><h3 class="break-all font-mono text-base font-semibold">{props.diff.file.path}</h3></div>
        <Show when={props.diff.file.old_path}><p class="break-all text-sm text-muted-foreground">{t("diff02", { path: props.diff.file.old_path ?? "" })}</p></Show>
        <Show when={props.diff.commit !== WORKTREE}><Badge variant="secondary">{t("diff03", { p1: props.diff.commit.slice(0, 8) })}</Badge></Show>
      </header>
      <Show when={props.diff.truncated}><Alert><AlertDescription>{t("diff04")}</AlertDescription></Alert></Show>
      <Show when={props.diff.patch.includes("Binary files ")}><Alert><AlertDescription>{t("diff05")}</AlertDescription></Alert></Show>
      <Card class="min-h-0 flex-1 overflow-auto">
        <pre class="min-w-max py-3 font-mono text-[11px] leading-4" aria-label={t("diff06")}><code>
          <For each={props.diff.patch.split("\n")}>{line => <span class={`block min-h-4 px-4 ${lineClass(line)}`}>{line || " "}</span>}</For>
        </code></pre>
      </Card>
  </section>;
}
