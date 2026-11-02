import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { git, type GitSettings } from "~/lib/git";
import { language, t, type Language } from "~/lib/i18n";
import { saveLanguage } from "~/lib/language-preferences";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

export default function GitSettingsDialog(props: { hasProject: boolean; open: boolean; onClose: () => void }) {
  const [languagePending, setLanguagePending] = createSignal(false);
  const [languageError, setLanguageError] = createSignal("");
  async function chooseLanguage(value: Language) {
    setLanguagePending(true); setLanguageError("");
    try { await saveLanguage(value); } catch (error) { setLanguageError(String(error)); }
    finally { setLanguagePending(false); }
  }
  const [scope, setScope] = createSignal("local");
  const [settings, setSettings] = createSignal<GitSettings>();
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let generation = 0;
  createEffect(() => {
    const active = props.open, area = scope(), token = ++generation;
    if (!active || !props.hasProject) return;
    setSettings(undefined); setError(""); setSaved(false); setPending(true);
    void git.getSettings(area).then(data => { if (token === generation) { setSettings(data); setValues({ ...data.values }); } }).catch(e => { if (token === generation) setError(String(e)); }).finally(() => { if (token === generation) setPending(false); });
  });
  function change(key: string, value: string) { setValues(current => ({ ...current, [key]: value })); setSaved(false); }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (pending() || !settings()) return;
    setPending(true); setError(""); setSaved(false);
    const changes = keys.filter(key => (values()[key] ?? "") !== (settings()!.values[key] ?? "")).map(key => ({ key, value: values()[key] || null }));
    try { const data = await git.saveSettings(scope(), changes); setSettings(data); setValues({ ...data.values }); setSaved(true); }
    catch(e) { setError(String(e)); }
    finally { setPending(false); }
  }
  const fields = createMemo(() => [
    { key: "user.name", label: t("cfg05") }, { key: "user.email", label: t("cfg06") }, { key: "init.defaultbranch", label: t("cfg07") },
    { key: "pull.rebase", label: t("cfg08"), options: [["false", t("cfg20")], ["true", t("cfg21")], ["merges", t("cfg22")], ["interactive", t("cfg23")]] },
    { key: "fetch.prune", label: t("cfg09"), options: [["true", t("cfg13")], ["false", t("cfg14")]] },
    { key: "push.autosetupremote", label: t("cfg10"), options: [["true", t("cfg13")], ["false", t("cfg14")]] },
    { key: "core.autocrlf", label: t("cfg11"), options: [["true", t("cfg24")], ["input", t("cfg25")], ["false", t("cfg26")]] },
  ]);
  const keys = fields().map(field => field.key);
  return <Dialog open={props.open} onOpenChange={open => { if (!open && !pending() && !languagePending()) props.onClose(); }}>
    <DialogContent animated={false} class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{t("lang04")}</DialogTitle><DialogDescription>{t("lang05")}</DialogDescription></DialogHeader>
      <label class="flex flex-col gap-1 text-sm font-medium">{t("lang01")}
        <select class="h-9 rounded-md border bg-background px-3 text-sm font-normal" value={language()} disabled={languagePending()} onChange={event => void chooseLanguage(event.currentTarget.value as Language)}>
          <option value="ru">{t("lang02")}</option><option value="en">{t("lang03")}</option>
        </select>
      </label>
      <Show when={languageError()}><p role="alert" class="text-sm text-destructive">{t("lang06", { error: languageError() })}</p></Show>
      <Show when={props.hasProject}>
      <div class="space-y-1 border-t pt-4"><h2 class="text-sm font-semibold">{t("cfg01")}</h2><p class="text-xs text-muted-foreground">{t("cfg04")}</p></div>
      <div class="flex gap-2"><For each={[["local", t("cfg02")], ["global", t("cfg03")]]}>{item => <Button size="sm" variant={scope() === item[0] ? "secondary" : "outline"} aria-pressed={scope() === item[0]} disabled={pending()} onClick={() => setScope(item[0])}>{item[1]}</Button>}</For></div>
      <Show when={settings()} fallback={<p class="text-sm text-muted-foreground" role="status">{pending() ? t("cfg18") : error()}</p>}>
        <form onSubmit={save} class="space-y-4">
          <For each={fields()}>{field => <div class="space-y-1">
            <Show when={field.options} fallback={<TextField value={values()[field.key] ?? ""} onChange={value => change(field.key, value)} disabled={pending()}><TextFieldLabel>{field.label}</TextFieldLabel><TextFieldInput autocomplete="off" spellcheck={false} /></TextField>}>
              <label class="flex flex-col gap-1 text-sm font-medium">{field.label}<select class="h-9 rounded-md border bg-background px-3 text-sm font-normal" value={values()[field.key] ?? ""} disabled={pending()} onChange={event => change(field.key, event.currentTarget.value)}>
                <option value="">{t("cfg12")}</option><Show when={values()[field.key] && !field.options?.some(option => option[0] === values()[field.key])}><option value={values()[field.key]}>{values()[field.key]}</option></Show><For each={field.options}>{option => <option value={option[0]}>{option[1]}</option>}</For>
              </select></label>
            </Show>
            <Show when={settings()?.effective[field.key]}>{value => <p class="break-all text-xs text-muted-foreground">{t("cfg19", { value: value() })}</p>}</Show>
          </div>}</For>
          <p class="text-xs text-muted-foreground">{t("cfg27")}</p>
          <Show when={error()}><p role="alert" class="text-sm text-destructive">{error()}</p></Show><Show when={saved()}><p role="status" class="text-sm text-muted-foreground">{t("cfg16")}</p></Show>
          <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={pending()} onClick={props.onClose}>{t("add09")}</Button><Button type="submit" disabled={pending()}>{pending() ? t("cfg28") : t("cfg15")}</Button></DialogFooter>
        </form>
      </Show>
      </Show>
    </DialogContent>
  </Dialog>;
}
