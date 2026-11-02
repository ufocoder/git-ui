import * as SelectPrimitive from "@kobalte/core/select";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "~/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectItemLabel = SelectPrimitive.ItemLabel;

export function SelectTrigger(props: ComponentProps<typeof SelectPrimitive.Trigger>) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return <SelectPrimitive.Trigger class={cn("flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", local.class)} {...rest}>
    {local.children}
    <SelectPrimitive.Icon><svg class="size-3 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}

export function SelectContent(props: ComponentProps<typeof SelectPrimitive.Content>) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content class={cn("z-50 min-w-[var(--kb-popper-anchor-width)] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md", local.class)} {...rest}>
      <SelectPrimitive.Listbox class="max-h-64 overflow-auto outline-none" />
      {local.children}
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
}

export function SelectItem(props: ComponentProps<typeof SelectPrimitive.Item>) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return <SelectPrimitive.Item class={cn("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-7 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", local.class)} {...rest}>
    {local.children}
    <SelectPrimitive.ItemIndicator class="absolute right-2 flex size-3.5 items-center justify-center" aria-hidden="true">✓</SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>;
}
