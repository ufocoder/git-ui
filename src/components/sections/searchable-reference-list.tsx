import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { SIDEBAR_ROW_STRIDE, WindowedList } from "~/components/ui/windowed-list";

export default function SearchableReferenceList(props: {
  items: string[];
  disabled: boolean;
  label: string;
  clearLabel: string;
  emptyLabel: string;
  onVisibleChange?: (items: readonly string[]) => void;
  children: (name: string) => JSX.Element;
}) {
  let anchor!: HTMLDivElement;
  const [availableHeight, setAvailableHeight] = createSignal(Infinity);
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal("");
  createEffect(() => {
    const value = query().trim().toLowerCase();
    if (!value) {
      setFilter("");
      return;
    }
    const timer = setTimeout(() => setFilter(value), 200);
    onCleanup(() => clearTimeout(timer));
  });
  const needsSearch = () => Math.max(0, props.items.length * SIDEBAR_ROW_STRIDE - 4) > availableHeight();
  const items = createMemo(() => {
    const value = filter();
    return value ? props.items.filter(name => name.toLowerCase().includes(value)) : props.items;
  });

  onMount(() => {
    const viewport = anchor.closest<HTMLElement>("[data-sidebar-scroll]");
    if (!viewport) return;
    const update = () => {
      // Measure the space at the top of the scroll range so scrolling itself
      // does not make the search field appear and disappear.
      const offset = anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top
        - viewport.clientTop + viewport.scrollTop;
      setAvailableHeight(Math.max(0, viewport.clientHeight - offset));
    };
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(anchor);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    update();
    onCleanup(() => observer.disconnect());
  });

  return <div ref={element => { anchor = element; }}>
    <Show when={props.items.length > 0 && (needsSearch() || query())}>
      <div class="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 pl-6">
        <TextField value={query()} onChange={setQuery} disabled={props.disabled}>
          <TextFieldInput class="h-7 bg-background px-2 text-xs" aria-label={props.label} placeholder={props.label} spellcheck={false}
            onKeyDown={event => {
              if (event.key === "Escape" && query()) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }} />
        </TextField>
        <Show when={query()}>
          <Button variant="ghost" size="icon" class="size-7" disabled={props.disabled} aria-label={props.clearLabel} title={props.clearLabel}
            onClick={() => setQuery("")}>×</Button>
        </Show>
      </div>
    </Show>
    <Show when={filter() && !items().length}><p role="status" class="pl-8 text-xs text-muted-foreground">{props.emptyLabel}</p></Show>
    <WindowedList items={items()} onVisibleChange={props.onVisibleChange}>{props.children}</WindowedList>
  </div>;
}
