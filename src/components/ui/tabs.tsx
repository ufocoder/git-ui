import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import * as TabsPrimitive from "@kobalte/core/tabs";
import { cn } from "~/lib/utils";

const Tabs = TabsPrimitive.Root;
const TabsContent = TabsPrimitive.Content;
const TabsList: Component<ComponentProps<typeof TabsPrimitive.List>> = props => {
  const [local, rest] = splitProps(props, ["class"]);
  return <TabsPrimitive.List class={cn("flex shrink-0 items-center gap-6 border-b px-4", local.class)} {...rest} />;
};
const TabsTrigger: Component<ComponentProps<typeof TabsPrimitive.Trigger>> = props => {
  const [local, rest] = splitProps(props, ["class"]);
  return <TabsPrimitive.Trigger class={cn("-mb-px inline-flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-disabled data-[selected]:border-primary data-[selected]:text-foreground", local.class)} {...rest} />;
};

export { Tabs, TabsContent, TabsList, TabsTrigger };
