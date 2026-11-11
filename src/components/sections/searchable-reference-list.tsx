import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { SIDEBAR_ROW_STRIDE, WindowedList } from "~/components/ui/windowed-list";

const sortModes = ["newest", "oldest", "name-ascending", "name-descending"] as const;
type SortMode = typeof sortModes[number];

export default function SearchableReferenceList(props: {
  items: string[];
  disabled: boolean;
  flushSearch?: boolean;
  label: string;
  clearLabel: string;
  emptyLabel: string;
  sort?: { initial: SortMode; dates?: Record<string, number> };
  onVisibleChange?: (items: readonly string[]) => void;
  children: (name: string) => JSX.Element;
}) {
  let anchor!: HTMLDivElement;
  const [availableHeight, setAvailableHeight] = createSignal(Infinity);
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal("");
  const [sortMode, setSortMode] = createSignal<SortMode>(props.sort?.initial ?? "name-ascending");
  const sortable = () => Boolean(props.sort && props.items.length > 1);
  const orderedItems = createMemo(() => {
    if (!props.sort) return props.items;
    const mode = sortMode();
    const dates = props.sort.dates;
    const items = [...props.items];
    if (mode === "newest" || mode === "oldest") {
      // Tag names arrive from Git in descending creation-date order.
      if (dates) items.sort((left, right) => (dates[right] ?? 0) - (dates[left] ?? 0));
      return mode === "newest" ? items : items.reverse();
    }
    items.sort((left, right) => left.localeCompare(right));
    return mode === "name-ascending" ? items : items.reverse();
  });
  const sortLabels = () => ({
    newest: t("reference-sort.newest"),
    oldest: t("reference-sort.oldest"),
    "name-ascending": t("reference-sort.name-ascending"),
    "name-descending": t("reference-sort.name-descending"),
  });
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
  createEffect(() => {
    if (!needsSearch()) {
      setQuery("");
      setFilter("");
    }
  });
  const matches = createMemo(() => {
    const value = filter();
    return new Set(value ? orderedItems().filter(name => name.toLowerCase().includes(value)) : []);
  });
  const items = createMemo(() => {
    const matching = matches();
    return matching.size ? [...matching, ...orderedItems().filter(name => !matching.has(name))] : orderedItems();
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
    <Show when={needsSearch()}>
      <div class="flex items-center gap-1 py-2" classList={{ "pl-6": !props.flushSearch && !sortable() }}>
        <Show when={sortable()}>
          <Button variant="ghost" size="icon"
            class="ml-0.5 size-7 shrink-0 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
            disabled={props.disabled} aria-label={sortLabels()[sortMode()]} title={sortLabels()[sortMode()]}
            onClick={() => setSortMode(mode => sortModes[(sortModes.indexOf(mode) + 1) % sortModes.length])}>
            <svg aria-hidden="true" viewBox="0 0 18 16" class="h-4 w-[18px]" classList={{ "translate-x-px": sortMode() === "newest" || sortMode() === "oldest" }} fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
              <Show when={sortMode() === "newest" || sortMode() === "oldest"} fallback={<path d="m1 11 3-7 3 7M2 9h4" />}>
                <rect x="1" y="5" width="6.5" height="7" rx="1" />
                <path d="M1 7.5h6.5M2.75 4v2m3-2v2" />
              </Show>
              <path d="M14 4v8" />
              <path d={sortMode() === "oldest" || sortMode() === "name-ascending" ? "m11 7 3-3 3 3" : "m11 9 3 3 3-3"} />
            </svg>
          </Button>
        </Show>
        <TextField class="min-w-0 flex-1" value={query()} onChange={setQuery} disabled={props.disabled}>
          <TextFieldInput class="h-7 bg-transparent px-2 text-xs opacity-60 focus:bg-background focus:opacity-100" aria-label={props.label} placeholder={props.label} spellcheck={false}
            onKeyDown={event => {
              if (event.key === "Escape" && query()) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }} />
        </TextField>
        <Show when={query()} fallback={<span class="w-7 shrink-0" aria-hidden="true" />}>
          <Button variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.disabled} aria-label={props.clearLabel} title={props.clearLabel}
            onClick={() => setQuery("")}>×</Button>
        </Show>
      </div>
    </Show>
    <Show when={filter() && !matches().size}><p role="status" class="sr-only">{props.emptyLabel}</p></Show>
    <WindowedList items={items()} highlightedCount={matches().size} onVisibleChange={props.onVisibleChange}>{props.children}</WindowedList>
  </div>;
}
