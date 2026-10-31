import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "~/lib/utils";

export const NativeSelect: Component<ComponentProps<"select">> = props => {
  const [local, rest] = splitProps(props, ["class"]);
  return <select class={cn("h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", local.class)} {...rest} />;
};
