import { t } from "~/lib/i18n";
import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";

export default function CommitMessageFields(props: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <TextField class="flex min-h-16 flex-1 flex-col" value={props.value} onChange={props.onChange} disabled={props.disabled} required>
    <TextFieldLabel class="sr-only">{t("commit.message")}</TextFieldLabel>
    <TextFieldTextArea class="min-h-16 flex-1 resize-none py-2" rows={2} placeholder={t("commit.title")} />
  </TextField>;
}
