import { t } from "~/lib/i18n";
import { For, Show } from "solid-js";
import { Badge } from "./badge";
import type { CommitReference } from "~/lib/git";

type CommitDescriptionProps = { subject: string; references: CommitReference[]; bold?: boolean };
export function CommitDescription(props: CommitDescriptionProps) {
  return <div class="relative min-w-0" title={props.subject}>
    <span class={props.bold ? "block truncate font-bold" : "block truncate"}>{props.subject}</span>
    <Show when={props.references.length}>
      <div class="absolute right-0 top-1/2 flex max-w-[85%] -translate-y-1/2 items-center gap-1 overflow-hidden pl-2"
        title={props.references.map(reference => reference.name).join(", ")}>
        <For each={props.references}>{reference =>
          <Badge variant={reference.kind === "tag" ? "outline" : "secondary"} class="max-w-40 shrink-0 gap-1 bg-secondary px-1.5 py-0 text-[10px] leading-4"
            aria-label={t("ref03", { p1: reference.kind === "tag" ? t("ref01") : t("ref02"), p2: reference.name })}>
            <span aria-hidden="true">{reference.kind === "tag" ? "◇" : "⑂"}</span>
            <span class="truncate">{reference.name}</span>
          </Badge>
        }</For>
      </div>
    </Show>
  </div>;
}
