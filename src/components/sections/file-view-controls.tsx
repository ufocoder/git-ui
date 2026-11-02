import { Button } from "~/components/ui/button";
import { NativeSelect } from "~/components/ui/native-select";
import { t } from "~/lib/i18n";
import type { FilePresentation } from "~/lib/file-presentation";

export default function FileViewControls(props: { value: FilePresentation; onChange: (value: FilePresentation) => void }) {
  const change = (value: Partial<FilePresentation>) => props.onChange({ ...props.value, ...value });
  return <div class="flex flex-wrap items-center gap-1 border-b pb-2" aria-label={t("files01")}>
    <div class="flex gap-1" role="group" aria-label={t("files02")}>
      <Button size="sm" class="h-7 px-2 text-xs" variant={props.value.view === "tree" ? "secondary" : "ghost"} aria-pressed={props.value.view === "tree"} onClick={() => change({ view: "tree" })}>{t("files03")}</Button>
      <Button size="sm" class="h-7 px-2 text-xs" variant={props.value.view === "list" ? "secondary" : "ghost"} aria-pressed={props.value.view === "list"} onClick={() => change({ view: "list" })}>{t("files04")}</Button>
    </div>
    <NativeSelect class="ml-auto h-7 w-auto max-w-full px-2 text-xs" aria-label={t("files05")} value={props.value.sort} onChange={event => {
      const sort = event.currentTarget.value;
      if (sort === "path" || sort === "name" || sort === "status") change({ sort });
    }}>
      <option value="path">{t("files06")}</option>
      <option value="name">{t("files07")}</option>
      <option value="status">{t("files08")}</option>
    </NativeSelect>
    <Button size="icon" variant="ghost" class="size-7 shrink-0" aria-label={props.value.descending ? t("files09") : t("files10")} title={props.value.descending ? t("files09") : t("files10")} aria-pressed={props.value.descending} onClick={() => change({ descending: !props.value.descending })}>
      <span aria-hidden="true">{props.value.descending ? "↓" : "↑"}</span>
    </Button>
  </div>;
}
