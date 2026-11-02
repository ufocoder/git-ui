import { t } from "~/lib/i18n";
import { For, Show, type JSX } from "solid-js";
import { Button } from "./button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible";
import type { FileTreeNode } from "~/lib/file-tree";

type FileTreeProps<T> = {
  nodes: FileTreeNode<T>[];
  nested?: boolean;
  selectedPath: string;
  disabled?: boolean;
  onSelect: (file: T) => void;
  renderIcon: (file: T) => JSX.Element;
  renderDirectoryControl?: (path: string) => JSX.Element;
  renderControl?: (file: T) => JSX.Element;
  fileTitle?: (file: T) => string;
};

export function FileTree<T>(props: FileTreeProps<T>) {
  return <ul aria-label={t("tree01")} class="min-w-0">
    <For each={props.nodes}>{(node, index) => <FileTreeItem {...props} node={node} last={index() === props.nodes.length - 1} />}</For>
  </ul>;
}

function FileTreeItem<T>(props: FileTreeProps<T> & { node: FileTreeNode<T>; last: boolean }) {
  return <li class="relative min-w-0">
    <Show when={props.nested}><span aria-hidden="true" class="pointer-events-none absolute -left-[9px] top-0 w-px bg-border" style={{ height: props.last ? "12px" : "100%" }} /></Show>
    <Show when={props.node.kind === "directory" ? props.node : undefined} fallback={
      <Show when={props.node.kind === "file" ? props.node : undefined}>{file =>
        <div class="flex min-w-0 items-center gap-1">
        {props.renderControl?.(file().value)}
        <Button variant={props.selectedPath === file().path ? "secondary" : "ghost"}
          class="h-6 min-h-6 w-full justify-start gap-2 px-2 py-0 text-left text-xs" disabled={props.disabled}
          aria-current={props.selectedPath === file().path ? "true" : undefined}
          onClick={() => props.onSelect(file().value)} title={props.fileTitle?.(file().value) ?? file().path}>
          {props.renderIcon(file().value)}
          <span class="min-w-0 truncate">{file().name}</span>
        </Button>
        </div>
      }</Show>
    }>{directory =>
      <Collapsible defaultOpen>
        <div class="flex min-w-0 items-center gap-1">
        {props.renderDirectoryControl?.(directory().path)}
        <CollapsibleTrigger as={Button} variant="ghost" class="group/folder h-6 min-h-6 w-full justify-start gap-2 px-2 py-0 text-left text-xs" title={directory().path}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3 shrink-0 transition-transform group-data-[expanded]/folder:rotate-90"><path d="m9 5 7 7-7 7" /></svg>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4 shrink-0 text-muted-foreground"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" /></svg>
          <span class="min-w-0 truncate">{directory().name}</span>
        </CollapsibleTrigger>
        </div>
        <CollapsibleContent class="ml-3 pl-[9px]">
          <FileTree {...props} nested nodes={directory().children} />
        </CollapsibleContent>
      </Collapsible>
    }</Show>
  </li>;
}
