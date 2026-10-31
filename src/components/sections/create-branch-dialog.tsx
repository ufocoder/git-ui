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
        <DialogTitle>{t("act17")}</DialogTitle>
        <DialogDescription>{t("br01")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={props.onSubmit} class="space-y-4">
        <TextField value={props.name} onChange={props.onNameChange} disabled={props.pending} validationState={props.error ? "invalid" : "valid"}>
          <TextFieldLabel>{t("act15")}</TextFieldLabel>
          <TextFieldInput placeholder={t("br02")} autocomplete="off" spellcheck={false} />
          <Show when={props.error}><TextFieldErrorMessage role="alert">{props.error}</TextFieldErrorMessage></Show>
        </TextField>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={props.pending} onClick={() => props.onOpenChange(false)}>{t("add09")}</Button>
          <Button type="submit" disabled={props.pending || !props.name.trim()}>{props.pending ? t("br03") : t("br04")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
