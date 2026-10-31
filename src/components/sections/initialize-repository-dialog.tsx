import { t } from "~/lib/i18n";
import { Show } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

type InitializeRepositoryDialogProps = {
  path: string;
  pending: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
};
export default function InitializeRepositoryDialog(props: InitializeRepositoryDialogProps) {
  return <Dialog open={Boolean(props.path)} onOpenChange={open => { if (!open && !props.pending) props.onCancel(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle class="pb-2">{t("init01")}</DialogTitle>
        <Badge variant="secondary" class="w-fit max-w-full break-all px-3 py-1 font-mono text-xs font-normal">{props.path}</Badge>
        <DialogDescription>{t("init02")}</DialogDescription>
      </DialogHeader>
      <Show when={props.error}><Alert variant="destructive"><AlertDescription class="break-all">{props.error}</AlertDescription></Alert></Show>
      <DialogFooter class="gap-2">
        <Button variant="outline" disabled={props.pending} onClick={props.onCancel}>{t("add09")}</Button>
        <Button disabled={props.pending} onClick={props.onConfirm}>{props.pending ? t("init03") : t("init04")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
