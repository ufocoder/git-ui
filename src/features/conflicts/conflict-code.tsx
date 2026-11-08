import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { changedLineBlocks, conflictMarkerBlocks, mergeLineBlocks, textLines } from "~/lib/conflict-lines";
import { t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldTextArea } from "~/components/ui/text-field";

type Props = { text: string; base: string | null; label: string; identity: string; tone: "ours" | "theirs" | "result"; editable?: boolean; disabled?: boolean; onChange?: (value: string) => void };
export default function ConflictCode(props: Props) {
  const lines = createMemo(() => { const result = textLines(props.text); return result.length ? result : [""]; });
  const changes = createMemo(() => props.base === null ? [] : changedLineBlocks(props.base, props.text));
  const markers = createMemo(() => props.tone === "result" ? conflictMarkerBlocks(props.text) : []);
  const blocks = createMemo(() => mergeLineBlocks([...changes(), ...markers()]));
  const [current, setCurrent] = createSignal(0);
  const [top, setTop] = createSignal(0);
  const [lineHeight, setLineHeight] = createSignal(16);
  const [padding, setPadding] = createSignal(12);
  let scroll!: HTMLDivElement | HTMLTextAreaElement;
  let editor: HTMLTextAreaElement | undefined;
  let host!: HTMLDivElement;
  function measure() {
    if (!scroll) return;
    const style = getComputedStyle(scroll);
    setLineHeight(parseFloat(style.lineHeight) || 16);
    setPadding(parseFloat(style.paddingTop) || 0);
  }
  onMount(() => {
    measure();
    const observer = new ResizeObserver(measure); observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(() => props.identity, () => { setCurrent(0); setTop(0); if (scroll) scroll.scrollTop = 0; }));
  createEffect(() => { setCurrent(index => Math.max(0, Math.min(index, blocks().length - 1))); });
  function navigate(index: number) {
    const next = Math.max(0, Math.min(index, blocks().length - 1)), block = blocks()[next];
    if (!block || !scroll) return;
    setCurrent(next); measure();
    if (editor) {
      const offset = lines().slice(0, block.start).reduce((total, line) => total + line.length + 1, 0);
      editor.focus({ preventScroll: true }); editor.setSelectionRange(offset, offset);
    }
    scroll.scrollTop = Math.max(0, padding() + block.start * lineHeight() - scroll.clientHeight / 3);
    setTop(scroll.scrollTop);
  }
  const changeClass = () => props.tone === "ours" ? "bg-error text-error-foreground" : props.tone === "theirs" ? "bg-success text-success-foreground" : "bg-info text-info-foreground";
  return <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background" role="region" aria-label={props.label}>
    <div class="flex h-control-compact min-w-0 shrink-0 items-center justify-end gap-1 border-b px-2">
      <Show when={props.editable}><span class="mr-auto truncate text-xs font-medium">{props.label}</span></Show>
      <Show when={blocks().length} fallback={<span class="truncate text-2xs text-muted-foreground">{props.base === null ? t("confNav06") : t("confNav05")}</span>}>
        <Show when={blocks().length > 1}><Button variant="ghost" size="icon" class="size-6" disabled={current() === 0} aria-label={t("confNav01")} onClick={() => navigate(current() - 1)}>↑</Button></Show>
        <Button variant="ghost" size="sm" class="h-6 px-1 text-2xs tabular-nums" aria-label={t("confNav04", { line: (blocks()[current()]?.start ?? 0) + 1 })} title={t("confNav03")} onClick={() => navigate(current())}>{current() + 1}/{blocks().length}</Button>
        <Show when={blocks().length > 1}><Button variant="ghost" size="icon" class="size-6" disabled={current() === blocks().length - 1} aria-label={t("confNav02")} onClick={() => navigate(current() + 1)}>↓</Button></Show>
      </Show>
    </div>
    <div ref={element => { host = element; }} class="relative min-h-0 flex-1 overflow-hidden">
      <Show when={props.editable} fallback={
        <div ref={element => { scroll = element; }} class="h-full overflow-auto py-3 font-mono text-diff leading-diff" tabindex="0" aria-label={props.label}>
          <div class="relative w-max min-w-full" style={{ "min-height": `${Math.max(1, lines().length) * lineHeight()}px` }}>
            <div class="pointer-events-none absolute inset-0" aria-hidden="true">
              <For each={changes()}>{block => <div class={changeClass()} style={{ position: "absolute", left: 0, right: 0, top: `${block.start * lineHeight()}px`, height: `${(block.end - block.start + 1) * lineHeight()}px` }} />}</For>
            </div>
            <pre class="pointer-events-none absolute left-0 top-0 m-0 w-10 select-none border-r px-2 text-right font-mono text-diff leading-diff text-muted-foreground" aria-hidden="true">{lines().map((_, index) => index + 1).join("\n")}</pre>
            <pre class="relative m-0 cursor-text select-text whitespace-pre pl-12 pr-3 font-mono text-diff leading-diff">{props.text || " "}</pre>
          </div>
        </div>
      }>
        <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <For each={changes()}>{block => <div class={changeClass()} style={{ position: "absolute", left: 0, right: 0, top: `${padding() + block.start * lineHeight() - top()}px`, height: `${(block.end - block.start + 1) * lineHeight()}px` }} />}</For>
          <For each={markers()}>{block => <div class="bg-warning" style={{ position: "absolute", left: 0, right: 0, top: `${padding() + block.start * lineHeight() - top()}px`, height: `${(block.end - block.start + 1) * lineHeight()}px` }} />}</For>
        </div>
        <TextField class="relative h-full min-h-0" value={props.text} onChange={value => props.onChange?.(value)} disabled={props.disabled}>
          <TextFieldTextArea ref={element => { scroll = element; editor = element; }} aria-label={props.label} class="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-3 font-mono text-diff leading-diff shadow-none focus-visible:ring-inset focus-visible:ring-offset-0" wrap="off" spellcheck={false} onScroll={event => setTop(event.currentTarget.scrollTop)} />
        </TextField>
      </Show>
    </div>
  </div>;
}
