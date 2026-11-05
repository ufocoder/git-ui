import { For, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";

// Sidebar rows have a fixed height. Keep only the viewport and a small buffer mounted.
export function WindowedList<T>(props: {
  items: readonly T[];
  children: (item: T) => JSX.Element;
  onVisibleChange?: (items: readonly T[]) => void;
  resetKey?: string;
}) {
  const stride = 36;
  const viewport = 288;
  const [scrollTop, setScrollTop] = createSignal(0);
  let container: HTMLDivElement | undefined;
  createEffect(on(() => props.resetKey, () => {
    if (container) container.scrollTop = 0;
    setScrollTop(0);
  }));
  createEffect(() => {
    const maximum = Math.max(0, props.items.length * stride - viewport);
    if (scrollTop() > maximum) {
      if (container) container.scrollTop = maximum;
      setScrollTop(maximum);
    }
  });
  const start = createMemo(() => Math.max(0, Math.floor(scrollTop() / stride) - 3));
  const end = createMemo(() => Math.min(props.items.length, start() + 14));
  const visible = createMemo(() => props.items.slice(start(), end()));
  createEffect(() => props.onVisibleChange?.(visible()));
  return <div ref={element => { container = element; }} class="min-w-0 overflow-y-auto" style={{ "max-height": `${viewport}px` }}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
    <ul class="m-0 w-full list-none space-y-1" style={{
      "padding-top": `${start() * stride}px`,
      "padding-bottom": `${Math.max(0, props.items.length - end()) * stride}px`,
    }}>
      <For each={visible()}>{props.children}</For>
    </ul>
  </div>;
}
