import { virtualRange } from "~/lib/virtual-range";
import { highlightedRanges } from "~/lib/pinned-branches";
import { For, createMemo, createSignal, onCleanup, onMount, createEffect, type JSX } from "solid-js";

export const SIDEBAR_ROW_STRIDE = 36;

// Sidebar lists share one scroll viewport and reserve space for unmounted rows.
export function WindowedList<T>(props: {
  items: readonly T[];
  children: (item: T) => JSX.Element;
  highlightedItems?: ReadonlySet<T>;
  onVisibleChange?: (items: readonly T[]) => void;
}) {
  const stride = SIDEBAR_ROW_STRIDE;
  const buffer = 3;
  const highlights = createMemo(() => highlightedRanges(props.items, props.highlightedItems ?? new Set<T>()));
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

  const window = createMemo(() => virtualRange(props.items.length, range().top, range().bottom - range().top, stride, buffer));
  const start = () => window().start;
  const end = () => window().end;
  const visible = createMemo(() => props.items.slice(start(), end()));
  createEffect(() => props.onVisibleChange?.(visible()));

  return <div ref={element => { list = element; }} class="relative min-w-0" style={{ height: `${Math.max(0, props.items.length * stride - 4)}px` }}>
    <For each={highlights()}>{range => <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 rounded-md bg-[hsl(var(--sidebar-foreground)/0.09)]"
      style={{ top: `${range.start * stride}px`, height: `${range.length * stride - 4}px` }} />}</For>
    <ul class="absolute inset-x-0 m-0 list-none space-y-1" style={{ top: `${Math.min(start(), Math.max(0, props.items.length - 1)) * stride}px` }}>
      <For each={visible()}>{props.children}</For>
    </ul>
  </div>;
}
