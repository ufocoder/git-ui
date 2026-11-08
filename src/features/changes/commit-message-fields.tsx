import { t } from "~/lib/i18n";
import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";

export default function CommitMessageFields(props: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <TextField value={props.value} onChange={props.onChange} disabled={props.disabled} required>
    <TextFieldLabel class="sr-only">{t("commit13")}</TextFieldLabel>
    <TextFieldTextArea class="max-h-40 min-h-20" rows={3} placeholder={t("commit14")} />
  </TextField>;
}
