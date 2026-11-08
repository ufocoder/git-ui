import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectItemLabel, SelectTrigger, SelectValue } from "~/components/ui/select";
import { t } from "~/lib/i18n";
import type { FilePresentation, FileSort } from "~/lib/file-presentation";

export default function FileViewControls(props: { value: FilePresentation; onChange: (value: FilePresentation) => void }) {
  const options: FileSort[] = ["path", "name", "status"];
  const label = (sort: FileSort) => sort === "path" ? t("files.by-path") : sort === "name" ? t("files.by-name") : t("files.by-status");
  const change = (value: Partial<FilePresentation>) => props.onChange({ ...props.value, ...value });
  return <div class="flex flex-wrap items-center gap-1 pb-2" aria-label={t("files.presentation")}>
    <div class="flex gap-1" role="group" aria-label={t("files.view")}>
      <Button size="sm" class="h-7 px-2 text-xs" variant={props.value.view === "tree" ? "secondary" : "ghost"} aria-pressed={props.value.view === "tree"} onClick={() => change({ view: "tree" })}>{t("files.tree")}</Button>
      <Button size="sm" class="h-7 px-2 text-xs" variant={props.value.view === "list" ? "secondary" : "ghost"} aria-pressed={props.value.view === "list"} onClick={() => change({ view: "list" })}>{t("files.list")}</Button>
    </div>
    <Select<FileSort> class="ml-auto min-w-0" options={options} value={props.value.sort} onChange={sort => { if (sort) change({ sort }); }} optionTextValue={label}
      disallowEmptySelection itemComponent={itemProps => <SelectItem item={itemProps.item}><SelectItemLabel>{label(itemProps.item.rawValue)}</SelectItemLabel></SelectItem>}>
        <SelectTrigger class="h-7 max-w-full px-2 text-xs" aria-label={t("files.sort")}>
          <SelectValue<FileSort>>{state => label(state.selectedOption())}</SelectValue>
        </SelectTrigger>
      <SelectContent />
    </Select>
    <Button size="icon" variant="ghost" class="size-7 shrink-0" aria-label={props.value.descending ? t("files.ascending") : t("files.descending")} title={props.value.descending ? t("files.ascending") : t("files.descending")} aria-pressed={props.value.descending} onClick={() => change({ descending: !props.value.descending })}>
      <span aria-hidden="true">{props.value.descending ? "↓" : "↑"}</span>
    </Button>
  </div>;
}
