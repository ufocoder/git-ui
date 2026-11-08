import type { TrackingMode } from "./repository-sync";
import { Show, createEffect, createSignal, createUniqueId, on } from "solid-js";
import { t } from "~/lib/i18n";
import type { History } from "~/lib/git";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { SelectField } from "~/components/ui/select";


type Props = {
  mode: TrackingMode | undefined;
  history: History | undefined;
  busy: boolean;
  onClose: () => void;
  onSubmit: (mode: TrackingMode, branch: string, remote: string, remoteBranch: string, url?: string) => Promise<void>;
};
export default function BranchTrackingDialog(props: Props) {
  const [branch, setBranch] = createSignal("");
  const [remote, setRemote] = createSignal("");
  const [remoteBranch, setRemoteBranch] = createSignal("");
  const [url, setUrl] = createSignal("");
  const needsOrigin = () => props.mode === "publish" && !props.history?.remotes.length;
  const [pending, setPending] = createSignal(false);
  const remoteId = createUniqueId(), branchId = createUniqueId();
  const branches = () => props.history?.remotes.find(entry => entry.name === remote())?.branches ?? [];
  createEffect(on(() => props.mode, mode => {
    if (!mode) return;
    const project = props.history;
    const remotes = project?.remotes ?? [];
    const linked = [...remotes].sort((a, b) => b.name.length - a.name.length).find(entry => project?.sync.upstream?.startsWith(entry.name + "/"));
    const selected = linked ?? remotes.find(entry => entry.name === "origin") ?? remotes[0];
    setBranch(project?.current_branch ?? "");
    setRemote(selected?.name ?? (mode === "publish" ? "origin" : ""));
    setUrl("");
    setRemoteBranch(linked ? project!.sync.upstream!.slice(linked.name.length + 1) : mode === "publish" ? project?.current_branch ?? "" : selected?.branches[0] ?? "");
  }));
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const mode = props.mode;
    if (!mode || pending() || props.busy || !remote() || !remoteBranch().trim() || (needsOrigin() && !url().trim())) return;
    setPending(true);
    try { await props.onSubmit(mode, branch(), remote(), remoteBranch().trim(), needsOrigin() ? url().trim() : undefined); props.onClose(); }
    catch { props.onClose(); /* The terminal displays operation errors. */ }
    finally { setPending(false); }
  }
  return <Dialog open={Boolean(props.mode)} onOpenChange={open => { if (!open && !pending() && !props.busy) props.onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{props.mode === "publish" ? t("track01") : t("track02")}</DialogTitle>
        <DialogDescription>{props.mode === "publish" ? t("track07", { branch: branch() }) : t("track08")}</DialogDescription>
      </DialogHeader>
      <p class="break-all text-sm">{t("track20", { branch: branch() })}</p>
      <form onSubmit={submit} class="space-y-4">
        <Show when={needsOrigin()} fallback={<div class="space-y-1">
          <label for={remoteId} class="text-sm font-medium">{t("track04")}</label>
          <SelectField id={remoteId} aria-label={t("track04")} value={remote()} disabled={pending() || props.busy}
            options={(props.history?.remotes ?? []).map(entry => ({ value: entry.name, label: entry.name }))} onChange={name => {
              setRemote(name);
              if (props.mode === "upstream") setRemoteBranch(props.history?.remotes.find(entry => entry.name === name)?.branches[0] ?? "");
            }} />
        </div>}>
          <TextField value={url()} onChange={setUrl} disabled={pending() || props.busy} required>
            <TextFieldLabel>{t("track21")}</TextFieldLabel>
            <TextFieldInput placeholder={t("add08")} autocomplete="off" spellcheck={false} />
            <p class="text-xs text-muted-foreground">{t("track22")}</p>
          </TextField>
        </Show>
        <Show when={props.mode === "publish"} fallback={
          <div class="space-y-1">
            <label for={branchId} class="text-sm font-medium">{t("track06")}</label>
            <SelectField id={branchId} aria-label={t("track06")} value={remoteBranch()} disabled={pending() || props.busy || !branches().length}
              options={branches().map(name => ({ value: name, label: name }))} onChange={setRemoteBranch} />
            <Show when={!branches().length}><p class="text-xs text-muted-foreground">{t("track11")}</p></Show>
          </div>
        }>
          <TextField value={remoteBranch()} onChange={setRemoteBranch} disabled={pending() || props.busy} required>
            <TextFieldLabel>{t("track05")}</TextFieldLabel>
            <TextFieldInput autocomplete="off" spellcheck={false} />
          </TextField>
        </Show>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={pending() || props.busy} onClick={props.onClose}>{t("add09")}</Button>
          <Button type="submit" disabled={pending() || props.busy || !remote() || !remoteBranch().trim() || (needsOrigin() && !url().trim()) || (props.mode === "upstream" && !branches().includes(remoteBranch()))}>
            {pending() ? (props.mode === "publish" ? t("nav06") : t("act16")) : props.mode === "publish" ? t("track09") : t("track10")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
