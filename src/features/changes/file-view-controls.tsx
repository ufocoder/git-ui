import { Show } from "solid-js";
import { FileViewToggle } from "~/components/ui/file-view-toggle";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectItemLabel, SelectTrigger, SelectValue } from "~/components/ui/select";
import { t } from "~/lib/i18n";
import type { FilePresentation, FileSort } from "~/lib/file-presentation";

export default function FileViewControls(props: { value: FilePresentation; onChange: (value: FilePresentation) => void }) {
  const options: FileSort[] = ["path", "name", "status"];
  const label = (sort: FileSort) => sort === "path" ? t("files.by-path") : sort === "name" ? t("files.by-name") : t("files.by-status");
  const change = (value: Partial<FilePresentation>) => props.onChange({ ...props.value, ...value });
  return <div class="flex flex-wrap items-center gap-1 pb-2" aria-label={t("files.presentation")}>
    <Show when={props.value.view === "tree"}>
    <span class="text-xs text-muted-foreground">{t("files.sort-by")}</span>
    <Select<FileSort> class="min-w-0" options={options} value={props.value.sort} onChange={sort => { if (sort) change({ sort }); }} optionTextValue={label}
      disallowEmptySelection itemComponent={itemProps => <SelectItem item={itemProps.item}><SelectItemLabel>{label(itemProps.item.rawValue)}</SelectItemLabel></SelectItem>}>
        <SelectTrigger class="h-7 max-w-full border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-accent hover:text-accent-foreground" aria-label={t("files.sort")}>
          <SelectValue<FileSort>>{state => state.selectedOption() === "path" ? t("files.column-path") : state.selectedOption() === "name" ? t("files.column-name") : t("files.column-status")}</SelectValue>
        </SelectTrigger>
      <SelectContent />
    </Select>
    <Button size="icon" variant="ghost" class="size-7 shrink-0" aria-label={props.value.descending ? t("files.ascending") : t("files.descending")} title={props.value.descending ? t("files.ascending") : t("files.descending")} aria-pressed={props.value.descending} onClick={() => change({ descending: !props.value.descending })}>
      <span aria-hidden="true">{props.value.descending ? "↓" : "↑"}</span>
    </Button>
    </Show>
    <div class="ml-auto"><FileViewToggle value={props.value.view} onChange={view => change({ view })} /></div>
  </div>;
}
