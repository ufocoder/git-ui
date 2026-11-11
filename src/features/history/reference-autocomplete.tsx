import * as Combobox from "@kobalte/core/combobox";
import { Show, createMemo, createSignal } from "solid-js";
import type { SelectOption } from "~/components/ui/select";
import { t } from "~/lib/i18n";

export default function ReferenceAutocomplete(props: {
  options: SelectOption[];
  disabled: boolean;
  scopePicker?: boolean;
  onSelect: (ref: string) => void;
}) {
  const [input, setInput] = createSignal("");
  const matches = createMemo(() => {
    const query = input().trim().toLowerCase();
    const results: SelectOption[] = [];
    for (const option of props.options) {
      if (option.label.toLowerCase().includes(query)) results.push(option);
      if (results.length === 50) break;
    }
    return results;
  });

  return <Combobox.Root<SelectOption> options={matches()} optionValue="value" optionTextValue="label" optionLabel="label"
    triggerMode="focus" allowsEmptyCollection allowDuplicateSelectionEvents defaultFilter={() => true}
    open={props.scopePicker ? true : undefined} closeOnSelection={!props.scopePicker}
    disabled={props.disabled}
    onOpenChange={(open, mode) => { if (!open || mode !== "input") setInput(""); }}
    onInputChange={setInput} onChange={option => { if (option) props.onSelect(option.value); }}
    itemComponent={item => <Combobox.Item item={item.item} class="cursor-default truncate rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
      <Combobox.ItemLabel>{item.item.rawValue.label}</Combobox.ItemLabel>
    </Combobox.Item>}>
    <Combobox.Control class="relative">
      <Combobox.Input aria-label={props.scopePicker ? t("history.branch-filter") : t("history.jump")} placeholder={props.scopePicker ? t("history.find-branch") : t("history.jump")} spellcheck={false}
        class="h-7 rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-disabled"
        classList={{ "w-full": props.scopePicker, "w-52": !props.scopePicker }} />
    </Combobox.Control>
    <Show when={props.scopePicker} fallback={
      <Combobox.Portal>
        <Combobox.Content class="z-50 w-[var(--kb-popper-anchor-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <Combobox.Listbox class="max-h-60 overflow-auto outline-none" />
          <Show when={!matches().length}><p role="status" class="px-2 py-1.5 text-xs text-muted-foreground">{t("history.no-matching-refs")}</p></Show>
        </Combobox.Content>
      </Combobox.Portal>
    }>
      <Combobox.Listbox class="mt-1 max-h-60 overflow-auto outline-none" />
      <Show when={!matches().length}><p role="status" class="px-2 py-1.5 text-xs text-muted-foreground">{t("branch-search.empty")}</p></Show>
    </Show>
  </Combobox.Root>;
}
