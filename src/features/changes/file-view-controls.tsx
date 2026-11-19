import type { JSX } from "solid-js";
import { FileViewToggle } from "~/components/ui/file-view-toggle";
import { t } from "~/lib/i18n";
import type { FilePresentation } from "~/lib/file-presentation";

export default function FileViewControls(props: { value: FilePresentation; onChange: (value: FilePresentation) => void; leading?: JSX.Element; actions?: JSX.Element }) {
  return <div class="flex min-w-0 items-center gap-2" aria-label={t("files.presentation")}>
    {props.leading}
    <div class="ml-auto flex items-center gap-1">
      {props.actions}
      <FileViewToggle value={props.value.view} onChange={view => props.onChange({ ...props.value, view })} />
    </div>
  </div>;
}
