import { For, Show } from "solid-js";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import type { FilePresentation, FileSort } from "~/lib/file-presentation";

export default function FileTableHeader(props: { presentation: FilePresentation; onPresentationChange: (value: FilePresentation) => void; class?: string }) {
  const sortColumns: FileSort[] = ["status", "name", "path"];
  const columnLabel = (sort: FileSort) => sort === "status" ? t("files.column-status") : sort === "name" ? t("files.column-name") : t("files.column-path");
  function sortFiles(sort: FileSort) {
    const current = props.presentation;
    props.onPresentationChange({ ...current, sort, descending: current.sort === sort ? !current.descending : false });
  }
  return <div class={cn("grid grid-cols-[1rem_minmax(0,1fr)_minmax(0,1.4fr)] h-8 items-center gap-x-4 border-b px-5 text-xs font-medium text-muted-foreground", props.class)}>
                <For each={sortColumns}>{sort => <button type="button" class="flex min-h-6 min-w-0 items-center gap-1 text-left hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring"
                  aria-label={`${columnLabel(sort)}: ${props.presentation.sort === sort && !props.presentation.descending ? t("files.descending") : t("files.ascending")}`}
                  title={columnLabel(sort)} aria-pressed={props.presentation.sort === sort} onClick={() => sortFiles(sort)}>
                  <Show when={sort !== "status"}><span class="truncate">{columnLabel(sort)}</span></Show>
                  <Show when={props.presentation.sort === sort} fallback={sort === "status" ? <span aria-hidden="true" class="w-4 text-center">•</span> : undefined}>
                    <svg aria-hidden="true" class="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d={props.presentation.descending ? "M12 4v16m-5-5 5 5 5-5" : "M12 20V4m-5 5 5-5 5 5"} /></svg>
                  </Show>
                </button>}</For>
              </div>;
}
