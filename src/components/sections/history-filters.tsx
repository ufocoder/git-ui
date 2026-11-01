import { onMount } from "solid-js";
import { t } from "~/lib/i18n";
import type { HistoryFilter } from "~/lib/git";
import { Button } from "~/components/ui/button";
import { TableHead, TableRow } from "~/components/ui/table";
import { TextField, TextFieldInput } from "~/components/ui/text-field";

type Props = {
  id: string;
  filter: HistoryFilter;
  disabled: boolean;
  onChange: (filter: HistoryFilter) => void;
};
export default function HistoryFilters(props: Props) {
  let searchInput!: HTMLInputElement;
  onMount(() => searchInput.focus());
  const active = () => Boolean(props.filter.text || props.filter.sha || props.filter.author || props.filter.file);
  return <>
    <TableRow id={`${props.id}-fields`} class="hover:bg-transparent" aria-label={t("find01")} title={t("find10")}>
      <TableHead class="h-auto p-0" />
      <TableHead class="h-auto px-2 py-1">
        <TextField class="min-w-0" value={props.filter.text} onChange={text => props.onChange({ ...props.filter, text })} disabled={props.disabled}>
          <TextFieldInput ref={element => { searchInput = element; }} type="search" class="h-7 min-w-0 px-2 text-xs font-normal" placeholder={t("find02")} aria-label={t("find02")} title={t("find09")} autocomplete="off" spellcheck={false} />
        </TextField>
      </TableHead>
      <TableHead class="h-auto px-2 py-1">
        <TextField class="min-w-0" value={props.filter.sha} onChange={sha => props.onChange({ ...props.filter, sha })} disabled={props.disabled}>
          <TextFieldInput class="h-7 min-w-0 px-2 font-mono text-xs font-normal" placeholder={t("find11")} aria-label={t("find11")} title={t("find12")} autocomplete="off" spellcheck={false} />
        </TextField>
      </TableHead>
      <TableHead class="h-auto px-2 py-1">
        <TextField class="min-w-0" value={props.filter.author} onChange={author => props.onChange({ ...props.filter, author })} disabled={props.disabled}>
          <TextFieldInput class="h-7 min-w-0 px-2 text-xs font-normal" placeholder={t("find03")} aria-label={t("find03")} autocomplete="off" spellcheck={false} />
        </TextField>
      </TableHead>
      <TableHead class="h-auto px-2 py-1 text-right">
        <Button size="sm" class="h-7 text-xs" variant="ghost" disabled={props.disabled || !active()} onClick={() => props.onChange({ text: "", sha: "", author: "", file: "" })}>{t("find05")}</Button>
      </TableHead>
    </TableRow>
    <TableRow id={`${props.id}-path`} class="hover:bg-transparent">
      <TableHead class="h-auto border-b p-0" />
      <TableHead class="h-auto border-b px-2 pb-2 pt-0">
        <TextField class="min-w-0" value={props.filter.file} onChange={file => props.onChange({ ...props.filter, file })} disabled={props.disabled}>
          <TextFieldInput class="h-7 min-w-0 px-2 text-xs font-normal" placeholder={t("find04")} aria-label={t("find04")} autocomplete="off" spellcheck={false} />
        </TextField>
      </TableHead>
      <TableHead colspan="3" class="h-auto border-b p-0" />
    </TableRow>
  </>;
}
