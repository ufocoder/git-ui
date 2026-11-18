import { For, Show } from "solid-js";
import { Button } from "./button";
import { t } from "~/lib/i18n";
import type { FileView } from "~/lib/file-presentation";

export function FileViewToggle(props: { value: FileView; onChange: (view: FileView) => void }) {
  return <div class="flex gap-1" role="group" aria-label={t("files.view")}>
    <For each={["tree", "list"] as const}>{view => <Button size="icon" class="size-7 text-muted-foreground" aria-label={view === "tree" ? t("files.tree") : t("files.list")} title={view === "tree" ? t("files.tree") : t("files.list")} variant={props.value === view ? "secondary" : "ghost"} aria-pressed={props.value === view} onClick={() => props.onChange(view)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0">
        <Show when={view === "tree"} fallback={<><rect x="3" y="3" width="7" height="7" rx="1" /><path d="M14 4h7M14 9h7" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 15h7M14 20h7" /></>}>
          <path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2a1 1 0 0 0-.8-.4h-3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM3 5h2M3 3v14a1 1 0 0 0 1 1h1" />
        </Show>
      </svg>
    </Button>}</For>
  </div>;
}
