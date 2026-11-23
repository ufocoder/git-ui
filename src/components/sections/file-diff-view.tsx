import { virtualOffsetRange } from "~/lib/virtual-range";
import { diffLayout, correspondingDiffRow } from "~/lib/diff-viewport";
import { diffSyntax } from "~/lib/diff-syntax";
import { PanelHeader } from "~/components/ui/panel-header";
import { FilePathLabel } from "~/components/ui/file-path-label";
import { t } from "~/lib/i18n";
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { FileStatus } from "~/components/ui/file-status";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { parseDiff, diffRows, type DiffLine, type DiffRow } from "~/lib/diff";
import type { FileDiff, WorktreeDiffScope } from "~/lib/git";

function readView() { try { return localStorage.getItem("git-ui.diff-view") === "split"; } catch { return false; } }
export default function FileDiffView(props: { diff: FileDiff; scope?: WorktreeDiffScope; inline?: boolean; stageDisabled?: boolean; onStageHunk?: (index: number) => void }) {
  const [split, setSplit] = createSignal(readView());
  const [collapse, setCollapse] = createSignal(true);
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [currentHunk, setCurrentHunk] = createSignal(0);
  const parsed = createMemo(() => parseDiff(props.diff.patch));
  const stats = createMemo(() => {
    let added = 0, removed = 0;
    for (const hunk of parsed().hunks) for (const line of hunk.lines) {
      if (line.kind === "add") added++;
      if (line.kind === "remove") removed++;
    }
    return { added, removed };
  });
  const rows = createMemo(() => diffRows(parsed(), split(), collapse(), expanded()));
  const [metrics, setMetrics] = createSignal({ line: 16, header: 24 });
  const [actionWidth, setActionWidth] = createSignal(0);
  const [view, setView] = createSignal({ top: 0, height: 480 });
  const layout = createMemo(() => diffLayout(rows(), metrics().line, metrics().header));
  const range = createMemo(() => virtualOffsetRange(layout().offsets, view().top, view().height, 12));
  const visibleRows = createMemo(() => rows().slice(range().start, range().end));
  let viewport!: HTMLDivElement, origin!: HTMLDivElement;
  let lineProbe!: HTMLDivElement, headerProbe!: HTMLDivElement;
  let actionProbe!: HTMLSpanElement;
  let scrollRoot: HTMLElement | undefined;
  let contentInset = 8;
  function updateViewport() {
    if (!scrollRoot || !origin) return;
    const viewportTop = scrollRoot === document.scrollingElement ? 0 : scrollRoot.getBoundingClientRect().top + scrollRoot.clientTop;
    const top = viewportTop - origin.getBoundingClientRect().top - contentInset;
    const height = scrollRoot.clientHeight;
    setView(previous => previous.top === top && previous.height === height ? previous : { top, height });
  }
  createEffect(() => {
    const inline = props.inline;
    if (!viewport || !origin) return;
    let root: HTMLElement = viewport;
    if (inline) {
      root = document.scrollingElement instanceof HTMLElement ? document.scrollingElement : viewport;
      for (let parent = viewport.parentElement; parent; parent = parent.parentElement) {
        if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) { root = parent; break; }
      }
    }
    scrollRoot = root;
    let frame = 0;
    const update = () => {
      contentInset = parseFloat(getComputedStyle(origin).paddingTop) || 0;
      const line = lineProbe.getBoundingClientRect().height || 16;
      const header = headerProbe.getBoundingClientRect().height || 24;
      setActionWidth(actionProbe.getBoundingClientRect().width);
      setMetrics(previous => previous.line === line && previous.header === header ? previous : { line, header });
      updateViewport();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    const observer = new ResizeObserver(schedule);
    for (const element of new Set<Element>([root, viewport, origin, lineProbe, headerProbe, actionProbe])) observer.observe(element);
    const scrollTarget = root === document.scrollingElement ? window : root;
    scrollTarget.addEventListener("scroll", schedule, { passive: true });
    update();
    onCleanup(() => { observer.disconnect(); scrollTarget.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); });
  });
  function scrollToOffset(offset: number) {
    if (!scrollRoot) return;
    updateViewport();
    scrollRoot.scrollTop += offset - view().top;
    updateViewport();
  }
  function preservePosition(change: () => void) {
    updateViewport();
    const index = virtualOffsetRange(layout().offsets, view().top, 1, 0).start;
    const row = rows()[index];
    const within = view().top - (layout().offsets[index] ?? 0);
    change();
    queueMicrotask(() => {
      const next = correspondingDiffRow(rows(), row, index);
      scrollToOffset((layout().offsets[next] ?? 0) + within);
    });
  }
  createEffect(on(createMemo(() => `${props.diff.commit}:${props.diff.file.path}:${props.scope ?? ""}`), () => {
    setExpanded(new Set<string>()); setCurrentHunk(0); if (!props.inline && viewport) viewport.scrollTop = 0;
    queueMicrotask(updateViewport);
  }));
  createEffect(() => { const count = parsed().hunks.length; setCurrentHunk(current => Math.max(0, Math.min(current, count - 1))); });
  function chooseView(value: boolean) {
    preservePosition(() => setSplit(value));
    try { localStorage.setItem("git-ui.diff-view", value ? "split" : "unified"); } catch { /* Optional preference. */ }
  }
  function navigate(direction: number) {
    const next = Math.min(parsed().hunks.length - 1, Math.max(0, currentHunk() + direction));
    setCurrentHunk(next);
    const index = layout().hunkRows[next];
    if (index !== undefined) scrollToOffset(layout().offsets[index]);
  }
  function canvasWidth(side?: "left" | "right") {
    const data = layout();
    const columns = side === "left" ? data.leftColumns : side === "right" ? data.rightColumns : Math.max(data.leftColumns, data.rightColumns);
    return `max(100%, calc(${columns}ch + ${side ? 68 : 108}px), calc(${data.headerColumns}ch + ${24 + (props.onStageHunk && side !== "left" ? actionWidth() : 0)}px))`;
  }
  function canvas(side?: "left" | "right") {
    return <div class="relative font-mono text-diff leading-diff" style={{ height: `${layout().total}px`, "min-width": canvasWidth(side) }}>
      <div class="absolute inset-x-0" style={{ top: `${layout().offsets[range().start]}px` }}>
        <For each={visibleRows()}>{(row, index) => renderRow(row, range().start + index(), side)}</For>
      </div>
    </div>;
  }
  function lineClass(line: DiffLine | null) {
    return line?.kind === "add" ? "bg-success text-success-foreground" : line?.kind === "remove" ? "bg-error text-error-foreground" : line?.kind === "meta" ? "text-muted-foreground italic" : "";
  }
  function renderRow(row: DiffRow, index: number, side?: "left" | "right") {
    if (row.kind === "header") return <div data-diff-row={index}
      class="flex h-diff-header min-w-max items-center justify-between gap-2 bg-info px-3 py-1 font-mono text-diff leading-diff text-info-foreground">
      <span>{row.text}</span>
      <Show when={side !== "left" && props.onStageHunk}>
        <Button variant="ghost" size="sm" class="h-full px-2 font-sans text-2xs" disabled={props.stageDisabled} onClick={() => props.onStageHunk?.(row.hunk)}>{t("stage.hunk")}</Button>
      </Show>
    </div>;
    if (row.kind === "fold") return <button data-diff-row={index} class="block h-diff-header w-full min-w-max bg-muted/50 px-3 text-left text-2xs text-muted-foreground hover:bg-muted" onClick={() => preservePosition(() => setExpanded(previous => new Set([...previous, row.id])))}>{t("diff.hidden-lines", { count: row.count })}</button>;
    const line = side === "left" ? row.left : side === "right" ? row.right : row.left ?? row.right;
    return <div data-diff-row={index} class={`flex h-diff-row min-w-max font-mono text-diff leading-diff ${lineClass(line)}`}>
      <Show when={side !== "right"}><span class="w-10 shrink-0 border-r px-1 text-right tabular-nums text-muted-foreground" aria-hidden="true">{row.left?.oldLine ?? ""}</span></Show>
      <Show when={side !== "left"}><span class="w-10 shrink-0 border-r px-1 text-right tabular-nums text-muted-foreground" aria-hidden="true">{row.right?.newLine ?? ""}</span></Show>
      <span class="w-4 shrink-0 text-center" aria-hidden="true">{line?.kind === "add" ? "+" : line?.kind === "remove" ? "−" : " "}</span>
      <code class="block whitespace-pre pr-3">
        <For each={diffSyntax(line?.text || " ", props.diff.file.path)}>{token =>
          <span class={token.kind ? `diff-token-${token.kind}` : undefined}>{token.text}</span>
        }</For>
      </code>
    </div>;
  }
  return <section class={props.inline ? "flex min-w-0 flex-col gap-2" : "flex h-full min-h-0 min-w-0 flex-col gap-2"} aria-label={t("diff.view")}>
    <div class="shrink-0 space-y-2">
      <PanelHeader class="-mx-4 px-4">
        <FileStatus status={props.diff.file.status} />
        <h3 class="flex min-w-0 flex-1"><FilePathLabel path={props.diff.file.path} /></h3>
        <Show when={parsed().hunks.length}>
          <span class="flex shrink-0 gap-2 text-xs tabular-nums" aria-label={t("diff.stats", { added: stats().added, removed: stats().removed })}>
            <span class="text-success-foreground">+{stats().added}</span><span class="text-destructive">−{stats().removed}</span>
          </span>
        </Show>
      </PanelHeader>
      <Show when={props.diff.file.old_path}><p class="break-all text-xs text-muted-foreground">{t("diff.previous-name", { path: props.diff.file.old_path ?? "" })}</p></Show>
      <Show when={parsed().hunks.length}>
        <div class="flex flex-wrap items-center gap-1">
          <Button size="sm" class="h-7 px-2 text-xs" variant={!split() ? "secondary" : "ghost"} aria-pressed={!split()} onClick={() => chooseView(false)}>{t("diff.unified")}</Button>
          <Button size="sm" class="h-7 px-2 text-xs" variant={split() ? "secondary" : "ghost"} aria-pressed={split()} onClick={() => chooseView(true)}>{t("diff.split")}</Button>
          <Button size="sm" class="h-7 px-2 text-xs" variant="ghost" aria-pressed={collapse()} onClick={() => preservePosition(() => { setCollapse(value => !value); setExpanded(new Set<string>()); })}>{collapse() ? t("diff.expand") : t("diff.collapse")}</Button>
          <div class="ml-auto flex items-center gap-1">
            <Show when={parsed().hunks.length > 1}>
            <Button size="icon" variant="ghost" class="size-7" disabled={currentHunk() === 0} aria-label={t("diff.previous")} title={t("diff.previous")} onClick={() => navigate(-1)}>↑</Button>
            </Show>
            <span class="text-2xs tabular-nums text-muted-foreground">{currentHunk() + 1}/{parsed().hunks.length}</span>
            <Show when={parsed().hunks.length > 1}>
            <Button size="icon" variant="ghost" class="size-7" disabled={currentHunk() >= parsed().hunks.length - 1} aria-label={t("diff.next")} title={t("diff.next")} onClick={() => navigate(1)}>↓</Button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
    <Show when={props.diff.truncated}><Alert class="rounded-none py-2"><AlertDescription>{t("diff.truncated")}</AlertDescription></Alert></Show>
    <Show when={props.diff.patch.includes("Binary files ")}><Alert><AlertDescription>{t("diff.binary")}</AlertDescription></Alert></Show>
    <Card ref={element => { viewport = element; }} class={props.inline ? "relative min-w-0 overflow-x-auto rounded-md border-0 shadow-none" : "relative min-h-0 flex-1 overflow-auto rounded-md border-0 shadow-none"} aria-label={t("diff.title")}>
      <div aria-hidden="true" class="pointer-events-none invisible absolute left-0 top-0 w-px">
        <div ref={element => { lineProbe = element; }} class="h-diff-row" />
        <div ref={element => { headerProbe = element; }} class="h-diff-header" />
        <span ref={element => { actionProbe = element; }} class="inline-flex whitespace-nowrap px-2 font-sans text-2xs">{t("stage.hunk")}</span>
      </div>
      <div ref={element => { origin = element; }} class="py-2 [overflow-anchor:none]">
      <Show when={parsed().hunks.length} fallback={<pre class="min-w-max whitespace-pre p-3 font-mono text-diff leading-diff">{props.diff.patch}</pre>}>
        <Show when={split()} fallback={canvas()}>
          <div class="grid grid-cols-2 divide-x">
            <div class="min-w-0 overflow-x-auto" aria-label={t("diff.before")}>{canvas("left")}</div>
            <div class="min-w-0 overflow-x-auto" aria-label={t("diff.after")}>{canvas("right")}</div>
          </div>
        </Show>
      </Show>
      </div>
    </Card>
  </section>;
}
