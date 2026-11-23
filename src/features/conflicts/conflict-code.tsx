import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { textLines, visibleConflictLines, visibleLineBlocks, type LineBlock } from "~/lib/conflict-lines";
import { TextField, TextFieldTextArea } from "~/components/ui/text-field";

type Props = { text: string; label: string; identity: string; tone: "ours" | "theirs" | "result"; editable?: boolean; disabled?: boolean; onChange?: (value: string) => void; current: number; changes: LineBlock[]; markers?: LineBlock[]; target?: LineBlock; navigation: number };
export default function ConflictCode(props: Props) {
  const lines = createMemo(() => { const result = props.editable ? [] : textLines(props.text); return result.length ? result : [""]; });
  const changes = () => props.changes;
  const markers = () => props.markers ?? [];
  let indexedText: string | undefined;
  let offsets = [0];
  function offsetForLine(line: number) {
    // Native textareas normalize CRLF. Index only when navigating, not on input.
    const text = editor?.value ?? props.text;
    if (text !== indexedText) {
      indexedText = text; offsets = [0];
      for (let index = 0; index < text.length; index++) if (text[index] === "\n") offsets.push(index + 1);
    }
    return offsets[line] ?? text.length;
  }
  const [top, setTop] = createSignal(0);
  const [lineHeight, setLineHeight] = createSignal(16);
  const [padding, setPadding] = createSignal(12);
  const [height, setHeight] = createSignal(320);
  const visible = createMemo(() => visibleConflictLines(lines().length, top(), height(), lineHeight()));
  const overlayRange = createMemo(() => ({ start: Math.max(0, Math.floor((top() - padding()) / lineHeight()) - 2), end: Math.max(0, Math.ceil((top() + height() - padding()) / lineHeight()) + 2) }));
  const visibleChanges = createMemo(() => visibleLineBlocks(changes(), overlayRange().start, overlayRange().end));
  const visibleMarkers = createMemo(() => visibleLineBlocks(markers(), overlayRange().start, overlayRange().end));
  const width = createMemo(() => lines().reduce((longest, line) => Math.max(longest, line.replace(/\t/g, "        ").length), 0));
  let scroll!: HTMLDivElement | HTMLTextAreaElement;
  let editor: HTMLTextAreaElement | undefined;
  let host!: HTMLDivElement;
  function measure() {
    if (!scroll) return;
    const style = getComputedStyle(scroll);
    setLineHeight(parseFloat(style.lineHeight) || 16);
    setPadding(parseFloat(style.paddingTop) || 0);
    setHeight(scroll.clientHeight);
  }
  onMount(() => {
    measure();
    queueMicrotask(() => navigate());
    const observer = new ResizeObserver(measure); observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(() => props.identity, () => { setTop(0); if (scroll) scroll.scrollTop = 0; }));
  function navigate() {
    const block = props.target;
    if (!block || !scroll) return;
    measure();
    if (editor) {
      const offset = offsetForLine(block.start);
      editor.setSelectionRange(offset, offset);
    }
    scroll.scrollTop = Math.max(0, padding() + block.start * lineHeight() - scroll.clientHeight / 3);
    setTop(scroll.scrollTop);
  }
  let initiallyNavigated = false;
  createEffect(on(() => props.identity, () => { initiallyNavigated = false; }));
  createEffect(() => {
    if (props.target && !initiallyNavigated) { initiallyNavigated = true; queueMicrotask(navigate); }
  });
  createEffect(on(() => [props.current, props.navigation], () => queueMicrotask(navigate)));
  const changeClass = () => props.tone === "ours" ? "bg-error text-error-foreground" : props.tone === "theirs" ? "bg-success text-success-foreground" : "bg-info text-info-foreground";
  return <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background" role="region" aria-label={props.label}>
    <Show when={props.editable}><div class="flex h-control-compact shrink-0 items-center border-b px-3 text-xs font-medium">{props.label}</div></Show>
    <div ref={element => { host = element; }} class="relative min-h-0 flex-1 overflow-hidden">
      <Show when={props.editable} fallback={
        <div ref={element => { scroll = element; }} onScroll={event => setTop(event.currentTarget.scrollTop)} class="h-full overflow-auto font-mono text-diff leading-diff" tabindex="0" aria-label={props.label}>
          <div class="relative min-w-full" style={{ height: `${lines().length * lineHeight()}px`, width: `calc(${width()}ch + 4rem)` }}>
            <div class="absolute inset-x-0" style={{ top: `${visible().start * lineHeight()}px` }}>
              <For each={lines().slice(visible().start, visible().end)}>{(line, index) => <div class={`flex whitespace-pre ${changes().some(block => visible().start + index() >= block.start && visible().start + index() <= block.end) ? changeClass() : ""}`} style={{ height: `${lineHeight()}px` }}>
                <span class="w-10 shrink-0 select-none border-r px-2 text-right text-muted-foreground" aria-hidden="true">{visible().start + index() + 1}</span>
                <span class="select-text whitespace-pre pl-2 pr-3">{line || " "}</span>
              </div>}</For>
            </div>
          </div>
        </div>
      }>
        <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <For each={visibleChanges()}>{block => <div class={changeClass()} style={{ position: "absolute", left: 0, right: 0, top: `${padding() + block.start * lineHeight() - top()}px`, height: `${(block.end - block.start + 1) * lineHeight()}px` }} />}</For>
          <For each={visibleMarkers()}>{block => <div class="bg-warning" style={{ position: "absolute", left: 0, right: 0, top: `${padding() + block.start * lineHeight() - top()}px`, height: `${(block.end - block.start + 1) * lineHeight()}px` }} />}</For>
        </div>
        <TextField class="relative h-full min-h-0" value={props.text} onChange={value => props.onChange?.(value)} disabled={props.disabled}>
          <TextFieldTextArea ref={element => { scroll = element; editor = element; }} aria-label={props.label} class="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-3 font-mono text-diff leading-diff shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" wrap="off" spellcheck={false} onScroll={event => setTop(event.currentTarget.scrollTop)} />
        </TextField>
      </Show>
    </div>
  </div>;
}
