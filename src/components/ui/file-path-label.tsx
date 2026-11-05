import { Show, createMemo } from "solid-js";
import { cn } from "~/lib/utils";

export function FilePathLabel(props: { path: string; class?: string }) {
  const parts = createMemo(() => {
    const separator = props.path.lastIndexOf("/");
    return { name: props.path.slice(separator + 1), directory: separator < 0 ? "" : props.path.slice(0, separator) };
  });
  return <span class={cn("flex min-w-0 flex-1 items-baseline gap-2", props.class)} title={props.path} aria-label={props.path}>
    <span class="min-w-0 truncate font-medium" classList={{ "max-w-[65%]": Boolean(parts().directory) }}>{parts().name}</span>
    <Show when={parts().directory}><span class="min-w-0 flex-1 truncate font-normal text-muted-foreground">{parts().directory}</span></Show>
  </span>;
}
