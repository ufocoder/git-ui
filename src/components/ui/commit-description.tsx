import { t } from "~/lib/i18n";
import { For, Show } from "solid-js";
import { Badge } from "./badge";
import type { CommitReference } from "~/lib/git";

type CommitDescriptionProps = { subject: string; references: CommitReference[]; bold?: boolean; currentBranch?: string };
export function CommitDescription(props: CommitDescriptionProps) {
  return <div class="flex min-w-0 items-center gap-2" title={props.subject}>
    <span class={props.bold ? "min-w-0 flex-1 truncate font-bold" : "min-w-0 flex-1 truncate"}>{props.subject}</span>
    <Show when={props.references.length}>
      <div class="flex max-w-[55%] shrink-0 items-center gap-1 overflow-hidden"
        title={props.references.map(reference => reference.name).join(", ")}>
        <For each={props.references.slice(0, 3)}>{reference =>
          <Badge variant="outline" data-kind={reference.kind} data-current={reference.kind === "branch" && reference.name === props.currentBranch ? "true" : undefined} class="commit-reference max-w-40 shrink-0 gap-1 rounded-sm px-1.5 py-0 text-3xs font-medium leading-4"
            aria-label={t("ref.label", { p1: reference.kind === "tag" ? t("ref.tag") : t("ref.branch"), p2: reference.name })}>
            <span aria-hidden="true">{reference.kind === "tag" ? "◇" : "⑂"}</span>
            <span class="truncate">{reference.name}</span>
          </Badge>
        }</For>
        <Show when={props.references.length > 3}><Badge variant="secondary" class="shrink-0 rounded-sm px-1.5 py-0 text-3xs font-normal leading-4">+{props.references.length - 3}</Badge></Show>
      </div>
    </Show>
  </div>;
}
