import * as Menu from "@kobalte/core/dropdown-menu";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "~/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export function DropdownMenuContent(props: ComponentProps<typeof Menu.Content>) {
  const [local, rest] = splitProps(props, ["class"]);
  return <Menu.Portal><Menu.Content class={cn("z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md", local.class)} {...rest} /></Menu.Portal>;
}
export function DropdownMenuItem(props: ComponentProps<typeof Menu.Item>) {
  const [local, rest] = splitProps(props, ["class"]);
  return <Menu.Item class={cn("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled", local.class)} {...rest} />;
}
export function DropdownMenuSeparator() { return <Menu.Separator class="-mx-1 my-1 h-px bg-border" />; }

export function DropdownMenuCheckboxItem(props: ComponentProps<typeof Menu.CheckboxItem>) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return <Menu.CheckboxItem closeOnSelect={false} class={cn("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled", local.class)} {...rest}>
    <Menu.ItemIndicator class="absolute left-2" aria-hidden="true">✓</Menu.ItemIndicator>
    <Menu.ItemLabel>{local.children}</Menu.ItemLabel>
  </Menu.CheckboxItem>;
}
