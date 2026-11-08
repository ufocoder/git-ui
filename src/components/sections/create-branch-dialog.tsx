import { t } from "~/lib/i18n";
import { Show } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel, TextFieldErrorMessage } from "~/components/ui/text-field";
import { Button } from "~/components/ui/button";

type CreateBranchDialogProps = {
  open: boolean;
  pending: boolean;
  name: string;
  error: string;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onSubmit: (event: SubmitEvent) => void;
};
export default function CreateBranchDialog(props: CreateBranchDialogProps) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("branch.create")}</DialogTitle>
        <DialogDescription>{t("branch.create-description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={props.onSubmit} class="space-y-4">
        <TextField value={props.name} onChange={props.onNameChange} disabled={props.pending} validationState={props.error ? "invalid" : "valid"}>
          <TextFieldLabel>{t("branch.input-name")}</TextFieldLabel>
          <TextFieldInput placeholder={t("branch.example")} autocomplete="off" spellcheck={false} />
          <Show when={props.error}><TextFieldErrorMessage role="alert">{props.error}</TextFieldErrorMessage></Show>
        </TextField>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={props.pending} onClick={() => props.onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={props.pending || !props.name.trim()}>{props.pending ? t("branch.creating") : t("branch.create-switch")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
