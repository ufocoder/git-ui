import type { ParentProps } from "solid-js";
import { cn } from "~/lib/utils";

export function PanelHeader(props: ParentProps<{ class?: string }>) {
  return <header class={cn("panel-header flex min-w-0 shrink-0 items-center justify-between gap-2 border-b text-xs font-medium", props.class)}>
    {props.children}
  </header>;
}
