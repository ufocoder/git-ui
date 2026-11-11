import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Button } from "~/components/ui/button";
import { DialogFooter } from "~/components/ui/dialog";
import { SelectField } from "~/components/ui/select";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { git, type GitSettings } from "~/lib/git";
import { t } from "~/lib/i18n";

export function createGitConfigForm(props: { open: boolean; repositoryOnly?: boolean; hasProject: boolean }) {
  const activeScope = () => props.repositoryOnly ? "local" : "global";
  const [settings, setSettings] = createSignal<GitSettings>();
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let generation = 0;
  onCleanup(() => { generation++; });
  createEffect(() => {
    const active = props.open, area = activeScope(), token = ++generation;
    if (!active || (props.repositoryOnly && !props.hasProject)) return;
    setSettings(undefined); setError(""); setSaved(false); setPending(true);
    void git.getSettings(area).then(data => { if (token === generation) { setSettings(data); setValues({ ...data.values }); } }).catch(e => { if (token === generation) setError(String(e)); }).finally(() => { if (token === generation) setPending(false); });
  });
  function change(key: string, value: string) { setValues(current => ({ ...current, [key]: value })); setSaved(false); }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (pending() || !settings()) return;
    setPending(true); setError(""); setSaved(false);
    const changes = groups().flatMap(group => group.fields.map(field => field.key)).filter(key => (values()[key] ?? "") !== (settings()!.values[key] ?? "")).map(key => ({ key, value: values()[key] || null }));
    try { const data = await git.saveSettings(activeScope(), changes); setSettings(data); setValues({ ...data.values }); setSaved(true); }
    catch(e) { setError(String(e)); }
    finally { setPending(false); }
  }
  const groups = createMemo(() => [
    { label: t("git-settings.group-identity"), fields: [
      { key: "user.name", label: t("git-settings.author") }, { key: "user.email", label: t("git-settings.email") },
    ] },
    { label: t("git-settings.group-signing"), fields: [
      { key: "gpg.format", label: t("git-settings.signing-format"), options: [["openpgp", "OpenPGP"], ["ssh", "SSH"], ["x509", "X.509"]] },
      { key: "user.signingkey", label: t("git-settings.signing-key") },
      { key: "commit.gpgsign", label: t("git-settings.sign-commits"), options: [["true", t("git-settings.yes")], ["false", t("git-settings.no")]] },
    ] },
    { label: t("git-settings.group-sync"), fields: [
      { key: "pull.rebase", label: t("git-settings.pull"), options: [["false", t("git-settings.merge")], ["true", t("git-settings.rebase")], ["merges", t("git-settings.rebase-merges")], ["interactive", t("git-settings.interactive-rebase")]] },
      { key: "fetch.prune", label: t("git-settings.prune"), options: [["true", t("git-settings.yes")], ["false", t("git-settings.no")]] },
      { key: "push.autosetupremote", label: t("git-settings.auto-upstream"), options: [["true", t("git-settings.yes")], ["false", t("git-settings.no")]] },
    ] },
    { label: t("git-settings.group-defaults"), fields: [
      { key: "init.defaultbranch", label: t("git-settings.initial-branch") },
      { key: "core.autocrlf", label: t("git-settings.line-endings"), options: [["true", t("git-settings.crlf")], ["input", t("git-settings.lf")], ["false", t("git-settings.no-conversion")]] },
    ] },
  ]);
  return { settings, values, pending, error, saved, groups, change, save };
}

export default function GitConfigForm(props: { form: ReturnType<typeof createGitConfigForm>; repositoryOnly?: boolean; hasProject: boolean; onClose: () => void }) {
  const { settings, values, pending, error, saved, groups, change, save } = props.form;
  return <Show when={!props.repositoryOnly || props.hasProject} fallback={<div class="space-y-4"><p class="text-sm text-muted-foreground">{t("settings.open-repository")}</p><DialogFooter><Button type="button" variant="outline" onClick={props.onClose}>{t("update.close")}</Button></DialogFooter></div>}>
    <Show when={!props.repositoryOnly}>
      <div class="rounded-md border bg-muted p-3">
        <p class="text-sm font-medium">{t("git-settings.global-warning")}</p>
        <p class="mt-1 text-xs text-muted-foreground">{t("git-settings.local-overrides")}</p>
      </div>
      <p class="text-xs text-muted-foreground">{t("git-settings.inherit-description")}</p>
    </Show>
    <Show when={settings()} fallback={<p class="text-sm text-muted-foreground" role="status">{pending() ? t("git-settings.loading") : error()}</p>}>
      <form onSubmit={save} class="space-y-6 pb-1">
        <For each={groups()}>{group => (
          <fieldset class="min-w-0 space-y-3">
            <legend class="mb-1 pt-1 text-base font-semibold text-foreground">{group.label}</legend>
            <For each={group.fields}>{field => <div class="space-y-1">
              <Show when={field.options} fallback={<TextField value={values()[field.key] ?? ""} onChange={value => change(field.key, value)} disabled={pending()}><TextFieldLabel>{field.label}</TextFieldLabel><TextFieldInput autocomplete="off" spellcheck={false} placeholder={settings()?.effective[field.key]} /></TextField>}>
                <SelectField label={field.label} value={values()[field.key] ?? ""} disabled={pending()} onChange={value => change(field.key, value)}
                  options={[
                    { value: "", label: t("git-settings.inherit") },
                    ...(values()[field.key] && !field.options?.some(option => option[0] === values()[field.key]) ? [{ value: values()[field.key], label: values()[field.key] }] : []),
                    ...(field.options ?? []).map(([value, label]) => ({ value, label })),
                  ]} />
              </Show>
              <Show when={props.repositoryOnly && values()[field.key]}>
                <Button type="button" variant="ghost" size="sm" disabled={pending()} onClick={() => change(field.key, "")}>{t("git-settings.inherit")}</Button>
              </Show>
              <Show when={(field.options || values()[field.key]) && settings()?.effective[field.key] !== settings()?.values[field.key] && settings()?.effective[field.key]}>
                {value => <p class="break-all text-xs text-muted-foreground">{t("git-settings.effective", {
                  value: field.options?.find(option => option[0] === value())?.[1] ?? value(),
                })}</p>}
              </Show>
            </div>}</For>
          </fieldset>
        )}</For>
        <p class="text-xs text-muted-foreground">{t("git-settings.scope-note")}</p>
        <Show when={error()}><p role="alert" class="text-sm text-destructive">{error()}</p></Show><Show when={saved()}><p role="status" class="text-sm text-muted-foreground">{t("git-settings.saved")}</p></Show>
        <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={pending()} onClick={props.onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={pending()}>{pending() ? t("git-settings.saving") : t("git-settings.save")}</Button></DialogFooter>
      </form>
    </Show>
  </Show>;
}
