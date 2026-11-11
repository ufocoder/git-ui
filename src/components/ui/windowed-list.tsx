import { For, createMemo, createSignal, onCleanup, onMount, createEffect, type JSX } from "solid-js";

export const SIDEBAR_ROW_STRIDE = 36;

// Sidebar lists share one scroll viewport and reserve space for unmounted rows.
export function WindowedList<T>(props: {
  items: readonly T[];
  children: (item: T) => JSX.Element;
  highlightedCount?: number;
  onVisibleChange?: (items: readonly T[]) => void;
}) {
  const stride = SIDEBAR_ROW_STRIDE;
  const buffer = 3;
  const highlightedCount = () => props.highlightedCount ?? 0;
  const [range, setRange] = createSignal({ top: 0, bottom: 288 });
  let list!: HTMLDivElement;

  onMount(() => {
    const viewport = list.closest<HTMLElement>("[data-sidebar-scroll]");
    if (!viewport) return;
    const update = () => {
      const top = viewport.getBoundingClientRect().top + viewport.clientTop - list.getBoundingClientRect().top;
      const bottom = top + viewport.clientHeight;
      setRange(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
    };
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(list);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener("scroll", update, { passive: true });
    update();
    onCleanup(() => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    });
  });

  const start = createMemo(() => Math.min(props.items.length, Math.max(0, Math.floor(range().top / stride) - buffer)));
  const end = createMemo(() => Math.min(props.items.length, Math.max(start(), Math.ceil(range().bottom / stride) + buffer)));
  const visible = createMemo(() => props.items.slice(start(), end()));
  createEffect(() => props.onVisibleChange?.(visible()));

  return <div ref={element => { list = element; }} class="relative min-w-0" style={{ height: `${Math.max(0, props.items.length * stride - 4)}px` }}>
    <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 rounded-md bg-[hsl(var(--sidebar-foreground)/0.09)]"
      style={{ height: `${Math.max(0, highlightedCount() * stride - 4)}px` }} />
    <ul class="absolute inset-x-0 m-0 list-none space-y-1" style={{ top: `${Math.min(start(), Math.max(0, props.items.length - 1)) * stride}px` }}>
      <For each={visible()}>{props.children}</For>
    </ul>
  </div>;
}
