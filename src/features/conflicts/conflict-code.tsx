import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { changedLineBlocks, conflictMarkerBlocks, mergeLineBlocks, textLines, visibleConflictLines } from "~/lib/conflict-lines";
import { TextField, TextFieldTextArea } from "~/components/ui/text-field";

type Props = { text: string; base: string | null; label: string; identity: string; tone: "ours" | "theirs" | "result"; editable?: boolean; disabled?: boolean; onChange?: (value: string) => void; current: number; navigation: number };
export default function ConflictCode(props: Props) {
  const lines = createMemo(() => { const result = textLines(props.text); return result.length ? result : [""]; });
  const changes = createMemo(() => props.base === null ? [] : changedLineBlocks(props.base, props.text));
  const markers = createMemo(() => props.tone === "result" ? conflictMarkerBlocks(props.text) : []);
  const blocks = createMemo(() => markers().length ? markers() : mergeLineBlocks([...changes()]));
  const [top, setTop] = createSignal(0);
  const [lineHeight, setLineHeight] = createSignal(16);
  const [padding, setPadding] = createSignal(12);
  const [height, setHeight] = createSignal(320);
  const visible = createMemo(() => visibleConflictLines(lines().length, top(), height(), lineHeight()));
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
    queueMicrotask(() => navigate(props.current));
    const observer = new ResizeObserver(measure); observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(() => props.identity, () => { setTop(0); if (scroll) scroll.scrollTop = 0; }));
  function navigate(index: number) {
    const next = Math.max(0, Math.min(index, blocks().length - 1)), block = blocks()[next];
    if (!block || !scroll) return;
    measure();
    if (editor) {
      const offset = lines().slice(0, block.start).reduce((total, line) => total + line.length + 1, 0);
      editor.setSelectionRange(offset, offset);
    }
    scroll.scrollTop = Math.max(0, padding() + block.start * lineHeight() - scroll.clientHeight / 3);
    setTop(scroll.scrollTop);
  }
  createEffect(on(() => [props.current, props.navigation], () => queueMicrotask(() => navigate(props.current))));
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
