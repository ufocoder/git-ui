import { FilePathLabel } from "./file-path-label";
import type { FileRowRenderer } from "~/lib/file-actions-context";
import { t } from "~/lib/i18n";
import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Button } from "./button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible";
import { flattenFileTree, type FileTreeNode } from "~/lib/file-tree";

type FileTreeProps<T> = {
  nodes: FileTreeNode<T>[];
  renderRow?: FileRowRenderer;
  label?: string;
  columns?: boolean;
  nested?: boolean;
  virtual?: boolean;
  selectedPath: string;
  disabled?: boolean;
  onSelect: (file: T) => void;
  onSelectDirectory?: (path: string) => void;
  renderIcon: (file: T) => JSX.Element;
  renderDirectoryControl?: (path: string) => JSX.Element;
  renderControl?: (file: T) => JSX.Element;
  fileTitle?: (file: T) => string;
};

function navigateTree(event: KeyboardEvent & { currentTarget: HTMLUListElement }) {
  const row = event.target;
  if (!(row instanceof HTMLButtonElement) || !row.hasAttribute("data-file-row")
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const toggle = row.hasAttribute("aria-expanded") ? row
      : row.parentElement?.querySelector<HTMLButtonElement>("[data-folder-toggle]");
    if (!toggle || toggle.disabled) return;
    event.preventDefault();
    if (toggle.getAttribute("aria-expanded") !== String(event.key === "ArrowRight")) toggle.click();
    row.focus({ preventScroll: true });
    return;
  }
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const scope = event.currentTarget.closest("[data-file-navigation]") ?? event.currentTarget;
  const visible = Array.from(scope.querySelectorAll<HTMLButtonElement>("[data-file-row]:not(:disabled)"))
    .filter(button => button.getClientRects().length > 0 && !button.closest("[hidden]"));
  const index = visible.indexOf(row);
  const next = visible[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (index < 0 || !next) return;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (next.hasAttribute("data-file-select")) next.click();
}

export function FileTree<T>(props: FileTreeProps<T>) {
  const large = createMemo(() => {
    if (props.nested) return false;
    if (props.virtual) return true;
    const levels = [props.nodes];
    let count = 0;
    while (levels.length) {
      const nodes = levels.pop()!;
      count += nodes.length;
      if (count > 200) return true;
      for (const node of nodes) if (node.kind === "directory") levels.push(node.children);
    }
    return false;
  });
  return <Show when={large()}
    fallback={<ul aria-label={props.label ?? t("tree.title")} class="min-w-0" onKeyDown={props.nested ? undefined : navigateTree}>
      <For each={props.nodes}>{(node, index) => <FileTreeItem {...props} node={node} last={index() === props.nodes.length - 1} />}</For>
    </ul>}>
    <VirtualFileList {...props} />
  </Show>;
}

const FILE_ROW_HEIGHT = 28;

function VirtualFileList<T>(props: FileTreeProps<T>) {
  let list!: HTMLUListElement;
  let viewport: HTMLElement | null = null;
  const [range, setRange] = createSignal({ top: 0, bottom: 480 });
  const [closedPaths, setClosedPaths] = createSignal(new Set<string>());
  const rows = createMemo(() => flattenFileTree(props.nodes, closedPaths()));
  function setOpen(path: string, open: boolean) {
    setClosedPaths(previous => {
      const next = new Set(previous);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  const rowHeight = () => props.columns ? 36 : FILE_ROW_HEIGHT;
  const start = createMemo(() => Math.min(Math.max(0, rows().length - 1), Math.max(0, Math.floor(range().top / rowHeight()) - 8)));
  const end = createMemo(() => Math.min(rows().length, Math.max(start(), Math.ceil(range().bottom / rowHeight()) + 8)));
  const visible = createMemo(() => rows().slice(start(), end()));
  function update() {
    if (!viewport) return;
    const top = viewport.getBoundingClientRect().top + viewport.clientTop - list.getBoundingClientRect().top;
    const bottom = top + viewport.clientHeight;
    setRange(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
  }
  onMount(() => {
    viewport = list.closest<HTMLElement>("[data-file-scroll]");
    for (let parent = list.parentElement; !viewport && parent; parent = parent.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) { viewport = parent; break; }
    }
    if (!viewport) return;
    const scrollContainer = viewport;
    const observer = new ResizeObserver(update);
    observer.observe(scrollContainer);
    observer.observe(list);
    if (scrollContainer.firstElementChild) observer.observe(scrollContainer.firstElementChild);
    scrollContainer.addEventListener("scroll", update, { passive: true });
    update();
    onCleanup(() => { observer.disconnect(); scrollContainer.removeEventListener("scroll", update); });
  });
  return <ul ref={element => { list = element; }} aria-label={props.label ?? t("tree.title")} class="min-w-0 [overflow-anchor:none]"
    style={{ "padding-top": `${start() * rowHeight()}px`, "padding-bottom": `${(rows().length - end()) * rowHeight()}px` }}
    onKeyDown={event => {
      const row = event.target;
      if (!(row instanceof HTMLButtonElement) || !row.hasAttribute("data-file-row") ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      const index = [...list.children].indexOf(row.closest("li")!);
      const next = start() + index + (event.key === "ArrowDown" ? 1 : -1);
      if (index < 0 || next < 0 || next >= rows().length || (next >= start() && next < end()) || !viewport) {
        navigateTree(event);
        return;
      }
      event.preventDefault();
      viewport.scrollTop += list.getBoundingClientRect().top + next * rowHeight() - viewport.getBoundingClientRect().top;
      update();
      const button = list.children[next - start()]?.querySelector<HTMLButtonElement>("[data-file-row]:not(:disabled)");
      button?.focus({ preventScroll: true });
      if (button?.hasAttribute("data-file-select")) button.click();
    }}>
    <For each={visible()}>{node => <FileTreeItem {...props} node={node.node} last={node.last} nested={node.depth > 0} depth={node.depth} guides={node.guides}
      open={!closedPaths().has(node.node.path)} onOpenChange={open => setOpen(node.node.path, open)} />}</For>
  </ul>;
}

function FileTreeItem<T>(props: FileTreeProps<T> & { node: FileTreeNode<T>; last: boolean; depth?: number; guides?: number[]; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const guideOffset = () => props.renderControl ? 16 : props.onSelectDirectory ? 9 : 11;
  return <li class="relative min-w-0" style={{ "margin-inline-start": props.depth ? `${props.depth * 24}px` : undefined }}>
    <For each={props.guides}>{depth => <span aria-hidden="true" class="pointer-events-none absolute top-0 w-px bg-border/75"
      style={{ left: `${(depth - (props.depth ?? 0)) * 24 - guideOffset()}px`, height: "100%" }} />}</For>
    <Show when={props.nested}><span aria-hidden="true" class="pointer-events-none absolute top-0 w-px bg-border/75" style={{ left: `${-guideOffset()}px`, height: props.last ? "14px" : "100%" }} /><span aria-hidden="true" class="pointer-events-none absolute top-3.5 h-px bg-border/75" style={{ left: `${-guideOffset()}px`, width: props.renderControl ? "12px" : props.onSelectDirectory ? "15px" : "17px" }} /></Show>
    <Show when={props.node.kind === "directory" ? props.node : undefined} fallback={
      <Show when={props.node.kind === "file" ? props.node : undefined}>{file =>
        <TreeRow path={file().path} directory={false} render={props.renderRow}>
        <div class={props.columns ? `flex min-w-0 items-center border-b border-border/50 ${props.disabled ? "" : "hover:bg-accent hover:text-accent-foreground"} ${props.selectedPath === file().path ? "bg-secondary text-secondary-foreground" : ""}` : "flex min-w-0 items-center gap-1"} style={{ "padding-inline-start": props.label || props.renderControl ? undefined : props.nested ? "4px" : props.onSelectDirectory ? "28px" : "20px" }}>
        <Show when={props.columns && props.renderControl} fallback={props.renderControl?.(file().value)}>
          <div class="flex h-9 w-12 shrink-0 items-center justify-center">{props.renderControl?.(file().value)}</div>
        </Show>
        <Show when={!props.columns && props.renderControl && !props.nested}><span aria-hidden="true" class="w-6 shrink-0" /></Show>
        <Button data-file-row data-file-select variant={props.selectedPath === file().path ? "secondary" : "ghost"}
          classList={{ "ml-1": Boolean(!props.columns && props.renderControl && props.nested) }}
          class={props.columns ? "grid h-9 min-h-9 min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-x-4 rounded-none bg-transparent px-1 py-0 text-left text-xs hover:bg-transparent" : "h-7 min-h-7 w-full justify-start gap-2 px-1 py-0 text-left text-xs"} disabled={props.disabled}
          aria-current={props.selectedPath === file().path ? "true" : undefined}
          onClick={event => { event.currentTarget.focus({ preventScroll: true }); props.onSelect(file().value); }} title={props.fileTitle?.(file().value) ?? file().path}>
          {props.renderIcon(file().value)}
          <FilePathLabel path={file().name} columns={props.columns} />
        </Button>
        </div>
        </TreeRow>
      }</Show>
    }>{directory =>
      <Collapsible defaultOpen open={props.open} onOpenChange={props.onOpenChange}>
        <TreeRow path={directory().path} directory render={props.renderRow}>
        <div class="flex min-w-0 items-center gap-1">
        {props.renderDirectoryControl?.(directory().path)}
        <Show when={props.onSelectDirectory} fallback={
        <CollapsibleTrigger as={Button} data-file-row variant="ghost" disabled={props.disabled} class="group/folder h-7 min-h-7 w-full justify-start gap-2 px-2 py-0 text-left text-xs [&>svg:first-child]:size-3" title={directory().path}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3 shrink-0 transition-transform group-data-[expanded]/folder:rotate-90"><path d="m9 6 6 6-6 6" /></svg>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4 shrink-0 text-muted-foreground"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" /></svg>
          <span class="min-w-0 truncate">{directory().name}</span>
        </CollapsibleTrigger>
        }>
          <CollapsibleTrigger as={Button} data-folder-toggle variant="ghost" size="icon" class="group/folder ml-[7px] -mr-px h-7 w-[18px] shrink-0 rounded-sm p-0 [&_svg]:size-3" disabled={props.disabled} aria-label={t("tree.toggle-folder", { path: directory().path })}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3 transition-transform group-data-[expanded]/folder:rotate-90"><path d="m9 6 6 6-6 6" /></svg>
          </CollapsibleTrigger>
          <Button data-file-row data-file-select variant={props.selectedPath === directory().path ? "secondary" : "ghost"} class="h-7 min-h-7 min-w-0 flex-1 justify-start gap-2 px-1 py-0 text-left text-xs" disabled={props.disabled}
            aria-current={props.selectedPath === directory().path ? "true" : undefined} onClick={event => { event.currentTarget.focus({ preventScroll: true }); props.onSelectDirectory?.(directory().path); }} title={directory().path}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4 shrink-0 text-muted-foreground"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" /></svg>
            <span class="min-w-0 truncate">{directory().name}</span>
          </Button>
        </Show>
        </div>
        </TreeRow>
        <Show when={props.depth === undefined}><CollapsibleContent class="ml-3 pl-3">
          <FileTree {...props} nested nodes={directory().children} />
        </CollapsibleContent></Show>
      </Collapsible>
    }</Show>
  </li>;
}

function TreeRow(props: { path: string; directory: boolean; render?: FileRowRenderer; children: JSX.Element }) {
  return props.render ? props.render(props.path, props.directory, props.children) : props.children;
}
