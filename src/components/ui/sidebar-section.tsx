import { Show, type ParentProps, type JSX } from "solid-js";
import { SidebarGroup, SidebarGroupLabel } from "./sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible";
import { Chevron } from "./repository-icons";

export function SidebarSection(props: ParentProps<{ title: string; count?: number; icon: JSX.Element; action: JSX.Element }>) {
  return <SidebarGroup>
    <Collapsible defaultOpen>
      <div class="flex items-center gap-1">
      <SidebarGroupLabel as={CollapsibleTrigger} class="group/section min-w-0 flex-1 cursor-pointer gap-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        {props.icon}
        <span>{props.title}<Show when={props.count !== undefined}> · {props.count}</Show></span>
        <Chevron />
      </SidebarGroupLabel>
      {props.action}
      </div>
      <CollapsibleContent>{props.children}</CollapsibleContent>
    </Collapsible>
  </SidebarGroup>;
}
