import { t } from "~/lib/i18n";
import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { FileStatus } from "~/components/ui/file-status";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { parseDiff, diffRows, type DiffLine, type DiffRow } from "~/lib/diff";
import { WORKTREE, type FileDiff, type WorktreeDiffScope } from "~/lib/git";

function readView() { try { return localStorage.getItem("git-ui.diff-view") === "split"; } catch { return false; } }
export default function FileDiffView(props: { diff: FileDiff; scope?: WorktreeDiffScope; inline?: boolean }) {
  const [split, setSplit] = createSignal(readView());
  const [collapse, setCollapse] = createSignal(true);
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [currentHunk, setCurrentHunk] = createSignal(0);
  const parsed = createMemo(() => parseDiff(props.diff.patch));
  const pathParts = createMemo(() => {
    const index = props.diff.file.path.lastIndexOf("/");
    return { directory: props.diff.file.path.slice(0, index + 1), name: props.diff.file.path.slice(index + 1) };
  });
  const stats = createMemo(() => {
    let added = 0, removed = 0;
    for (const hunk of parsed().hunks) for (const line of hunk.lines) {
      if (line.kind === "add") added++;
      if (line.kind === "remove") removed++;
    }
    return { added, removed };
  });
  const rows = createMemo(() => diffRows(parsed(), split(), collapse(), expanded()));
  const headers = new Map<number, HTMLDivElement>();
  let viewport!: HTMLDivElement;
  createEffect(on(createMemo(() => `${props.diff.commit}:${props.diff.file.path}:${props.scope ?? ""}`), () => { setExpanded(new Set<string>()); setCurrentHunk(0); if (viewport) viewport.scrollTop = 0; }));
  createEffect(() => { const count = parsed().hunks.length; setCurrentHunk(current => Math.max(0, Math.min(current, count - 1))); });
  function chooseView(value: boolean) { setSplit(value); try { localStorage.setItem("git-ui.diff-view", value ? "split" : "unified"); } catch { /* Optional preference. */ } }
  function navigate(direction: number) {
    const next = Math.min(parsed().hunks.length - 1, Math.max(0, currentHunk() + direction));
    setCurrentHunk(next);
    const target = headers.get(next);
    if (target && props.inline) { target.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
    if (target && viewport) viewport.scrollTo({ top: target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop, behavior: "smooth" });
  }
  function lineClass(line: DiffLine | null) {
    return line?.kind === "add" ? "bg-success text-success-foreground" : line?.kind === "remove" ? "bg-error text-error-foreground" : line?.kind === "meta" ? "text-muted-foreground italic" : "";
  }
  function renderRow(row: DiffRow, side?: "left" | "right") {
    if (row.kind === "header") return <div ref={element => { if (side !== "right") headers.set(row.hunk, element); }} class="h-diff-header min-w-max bg-info px-3 py-1 font-mono text-diff leading-diff text-info-foreground">{row.text}</div>;
    if (row.kind === "fold") return <button class="block h-diff-header w-full min-w-max bg-muted/50 px-3 text-left text-2xs text-muted-foreground hover:bg-muted" onClick={() => setExpanded(previous => new Set([...previous, row.id]))}>{t("diff12", { count: row.count })}</button>;
    const line = side === "left" ? row.left : side === "right" ? row.right : row.left ?? row.right;
    return <div class={`flex h-diff-row min-w-max font-mono text-diff leading-diff ${lineClass(line)}`}>
      <Show when={side !== "right"}><span class="w-10 shrink-0 border-r px-1 text-right tabular-nums text-muted-foreground" aria-hidden="true">{row.left?.oldLine ?? ""}</span></Show>
      <Show when={side !== "left"}><span class="w-10 shrink-0 border-r px-1 text-right tabular-nums text-muted-foreground" aria-hidden="true">{row.right?.newLine ?? ""}</span></Show>
      <span class="w-4 shrink-0 text-center" aria-hidden="true">{line?.kind === "add" ? "+" : line?.kind === "remove" ? "−" : " "}</span>
      <code class="block whitespace-pre pr-3">{line?.text || " "}</code>
    </div>;
  }
  return <section class={props.inline ? "flex min-w-0 flex-col gap-2" : "flex h-full min-h-0 min-w-0 flex-col gap-2"} aria-label={t("diff01")}>
    <header class="shrink-0 space-y-2">
      <div class="flex min-w-0 items-center gap-2">
        <FileStatus status={props.diff.file.status} />
        <h3 class="flex min-w-0 flex-1 items-baseline text-sm font-medium" title={props.diff.file.path} aria-label={props.diff.file.path}>
          <Show when={pathParts().directory}><span class="min-w-0 truncate font-normal text-muted-foreground">{pathParts().directory}</span></Show>
          <span class="max-w-full shrink-0 truncate">{pathParts().name}</span>
        </h3>
        <Show when={parsed().hunks.length}>
          <span class="flex shrink-0 gap-2 text-xs tabular-nums" aria-label={t("diff17", { added: stats().added, removed: stats().removed })}>
            <span class="text-success-foreground">+{stats().added}</span><span class="text-destructive">−{stats().removed}</span>
          </span>
        </Show>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Show when={props.scope}><Badge variant="secondary">{props.scope === "staged" ? t("stage01") : t("stage02")}</Badge></Show>
        <Show when={props.diff.commit !== WORKTREE}><Badge variant="secondary">{t("diff03", { p1: props.diff.commit.slice(0, 8) })}</Badge></Show>
      </div>
      <Show when={props.diff.file.old_path}><p class="break-all text-xs text-muted-foreground">{t("diff02", { path: props.diff.file.old_path ?? "" })}</p></Show>
      <Show when={parsed().hunks.length}>
        <div class="flex flex-wrap items-center gap-1">
          <Button size="sm" class="h-7 px-2 text-xs" variant={!split() ? "secondary" : "ghost"} aria-pressed={!split()} onClick={() => chooseView(false)}>{t("diff07")}</Button>
          <Button size="sm" class="h-7 px-2 text-xs" variant={split() ? "secondary" : "ghost"} aria-pressed={split()} onClick={() => chooseView(true)}>{t("diff08")}</Button>
          <Button size="sm" class="h-7 px-2 text-xs" variant="ghost" aria-pressed={collapse()} onClick={() => { setCollapse(value => !value); setExpanded(new Set<string>()); }}>{collapse() ? t("diff14") : t("diff13")}</Button>
          <div class="ml-auto flex items-center gap-1">
            <Show when={parsed().hunks.length > 1}>
            <Button size="icon" variant="ghost" class="size-7" disabled={currentHunk() === 0} aria-label={t("diff09")} title={t("diff09")} onClick={() => navigate(-1)}>↑</Button>
            </Show>
            <span class="text-2xs tabular-nums text-muted-foreground">{currentHunk() + 1}/{parsed().hunks.length}</span>
            <Show when={parsed().hunks.length > 1}>
            <Button size="icon" variant="ghost" class="size-7" disabled={currentHunk() >= parsed().hunks.length - 1} aria-label={t("diff10")} title={t("diff10")} onClick={() => navigate(1)}>↓</Button>
            </Show>
          </div>
        </div>
      </Show>
    </header>
    <Show when={props.diff.truncated}><Alert><AlertDescription>{t("diff04")}</AlertDescription></Alert></Show>
    <Show when={props.diff.patch.includes("Binary files ")}><Alert><AlertDescription>{t("diff05")}</AlertDescription></Alert></Show>
    <Card ref={element => { viewport = element; }} class={props.inline ? "min-w-0 overflow-x-auto" : "min-h-0 flex-1 overflow-auto"} aria-label={t("diff06")}>
      <Show when={parsed().hunks.length} fallback={<pre class="min-w-max whitespace-pre p-3 font-mono text-diff leading-diff">{props.diff.patch}</pre>}>
        <Show when={split()} fallback={<div class="min-w-max py-2"><For each={rows()}>{row => renderRow(row)}</For></div>}>
          <div class="grid grid-cols-2 divide-x">
            <div class="min-w-0 overflow-x-auto py-2" aria-label={t("diff15")}><For each={rows()}>{row => renderRow(row, "left")}</For></div>
            <div class="min-w-0 overflow-x-auto py-2" aria-label={t("diff16")}><For each={rows()}>{row => renderRow(row, "right")}</For></div>
          </div>
        </Show>
      </Show>
    </Card>
  </section>;
}
