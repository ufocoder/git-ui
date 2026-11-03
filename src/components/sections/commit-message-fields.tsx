import { createMemo, createSignal, createEffect, on } from "solid-js";
import { t } from "~/lib/i18n";
import { composeCommitMessage, splitCommitMessage } from "~/lib/commit-message";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";

export default function CommitMessageFields(props: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const parts = createMemo(() => splitCommitMessage(props.value));
  const [descriptionOpen, setDescriptionOpen] = createSignal(Boolean(parts().body));
  createEffect(on(() => parts().body, body => { if (body) setDescriptionOpen(true); }));
  return <div class="space-y-2">
    <TextField value={parts().subject} onChange={subject => props.onChange(composeCommitMessage(subject, parts().body))} disabled={props.disabled} required>
      <TextFieldLabel>{t("compose01")}</TextFieldLabel>
      <TextFieldInput class="h-control-sm" placeholder={t("compose02")} autocomplete="off" />
    </TextField>
    <Collapsible open={descriptionOpen()} onOpenChange={setDescriptionOpen}>
      <CollapsibleTrigger as={Button} type="button" variant="ghost" size="sm" class="h-control-compact px-0 text-muted-foreground" disabled={props.disabled}>
        <span aria-hidden="true">{descriptionOpen() ? "−" : "+"}</span>{t("compose03")}
      </CollapsibleTrigger>
      <CollapsibleContent class="pt-2">
        <TextField value={parts().body} onChange={body => props.onChange(composeCommitMessage(parts().subject, body))} disabled={props.disabled}>
          <TextFieldLabel class="sr-only">{t("compose03")}</TextFieldLabel>
          <TextFieldTextArea class="max-h-36 min-h-20" rows={3} placeholder={t("compose04")} />
        </TextField>
      </CollapsibleContent>
    </Collapsible>
  </div>;
}
