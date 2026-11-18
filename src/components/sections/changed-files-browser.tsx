import FileTableHeader from "./file-table-header";
import { Show } from "solid-js";
import { FileViewToggle } from "~/components/ui/file-view-toggle";
import { PanelHeader } from "~/components/ui/panel-header";
import { t } from "~/lib/i18n";
import type { FilePresentation } from "~/lib/file-presentation";
import ChangedFilesTree, { type ChangedFilesTreeProps } from "./changed-files-tree";

type Props = ChangedFilesTreeProps & {
  presentation: FilePresentation;
  onPresentationChange: (value: FilePresentation) => void;
  loading: boolean;
  error?: string;
};

export default function ChangedFilesBrowser(props: Props) {
  return <>
    <PanelHeader class="px-4"><h3>{t("details.files", { count: props.files.length })}</h3>
      <FileViewToggle value={props.presentation.view} onChange={view => props.onPresentationChange({ ...props.presentation, view })} />
    </PanelHeader>
    <div data-file-scroll class={props.presentation.view === "list" ? "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] [&_[data-file-row]]:px-5" : "min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-2 [scrollbar-gutter:stable]"}>
            <Show when={props.presentation.view === "list"}>
              <FileTableHeader presentation={props.presentation} onPresentationChange={props.onPresentationChange} />
            </Show>

      <Show when={props.loading}><p role="status" class="px-3 py-2 text-sm text-muted-foreground">{t("details.loading")}</p></Show>
      <Show when={!props.loading && !props.files.length && !props.error}><p class="px-3 py-2 text-sm text-muted-foreground">{t("details.no-files")}</p></Show>
      <ChangedFilesTree {...props} virtual />
    </div>
  </>;
}
