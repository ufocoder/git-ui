import ThemePreview from "./theme-preview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { themes, theme, saveTheme } from "~/lib/theme-preferences";
import { SelectField } from "~/components/ui/select";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { git, type GitSettings } from "~/lib/git";
import { language, t, type Language } from "~/lib/i18n";
import { saveLanguage } from "~/lib/language-preferences";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

export default function GitSettingsDialog(props: { hasProject: boolean; open: boolean; onClose: () => void }) {
  const [draftTheme, setDraftTheme] = createSignal(theme());
  createEffect(() => {
    if (props.open) setDraftTheme(theme());
  });
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
  onCleanup(() => { generation++; });
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
    { key: "user.name", label: t("git-settings.author") }, { key: "user.email", label: t("git-settings.email") }, { key: "init.defaultbranch", label: t("git-settings.initial-branch") },
    { key: "pull.rebase", label: t("git-settings.pull"), options: [["false", t("git-settings.merge")], ["true", t("git-settings.rebase")], ["merges", t("git-settings.rebase-merges")], ["interactive", t("git-settings.interactive-rebase")]] },
    { key: "fetch.prune", label: t("git-settings.prune"), options: [["true", t("git-settings.yes")], ["false", t("git-settings.no")]] },
    { key: "push.autosetupremote", label: t("git-settings.auto-upstream"), options: [["true", t("git-settings.yes")], ["false", t("git-settings.no")]] },
    { key: "core.autocrlf", label: t("git-settings.line-endings"), options: [["true", t("git-settings.crlf")], ["input", t("git-settings.lf")], ["false", t("git-settings.no-conversion")]] },
  ]);
  const keys = fields().map(field => field.key);
  return <Dialog open={props.open} onOpenChange={open => { if (!open && !pending() && !languagePending()) props.onClose(); }}>
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{t("settings.title")}</DialogTitle><DialogDescription>{t("settings.description")}</DialogDescription></DialogHeader>
      <Tabs defaultValue="appearance" class="min-w-0">
        <TabsList class="mb-4 px-0" aria-label={t("settings.title")}>
          <TabsTrigger value="appearance">{t("settings.appearance")}</TabsTrigger>
          <TabsTrigger value="git">{t("settings.git")}</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" class="space-y-4 outline-none">
          <div class="flex items-end gap-2">
            <SelectField class="flex-1" label={t("theme.title")} value={draftTheme()} onChange={setDraftTheme}
              options={themes.map(item => ({ value: item.id, label: item.id === "default" ? t("theme.light") : item.id === "dark" ? t("theme.dark") : item.name }))} />
            <Button type="button" size="sm" disabled={draftTheme() === theme()} onClick={() => saveTheme(draftTheme())}>{t("theme.apply")}</Button>
          </div>
          <ThemePreview theme={draftTheme()} dark={themes.some(item => item.id === draftTheme() && item.dark)} />
      <SelectField label={t("language.title")} value={language()} disabled={languagePending()} onChange={value => void chooseLanguage(value as Language)}
        options={[{ value: "ru", label: t("language.russian") }, { value: "en", label: t("language.english") }]} />
      <Show when={languageError()}><p role="alert" class="text-sm text-destructive">{t("language.save-error", { error: languageError() })}</p></Show>
      <p class="text-xs text-muted-foreground">{t("language.scope-note")}</p>
      <DialogFooter><Button type="button" variant="outline" disabled={languagePending()} onClick={props.onClose}>{t("update.close")}</Button></DialogFooter>
        </TabsContent>
        <TabsContent value="git" class="space-y-4 outline-none">
      <Show when={props.hasProject} fallback={<div class="space-y-4"><p class="text-sm text-muted-foreground">{t("settings.open-repository")}</p><DialogFooter><Button type="button" variant="outline" onClick={props.onClose}>{t("update.close")}</Button></DialogFooter></div>}>
      <p class="text-xs text-muted-foreground">{t("git-settings.inherit-description")}</p>
      <div class="flex gap-2"><For each={[["local", t("git-settings.local")], ["global", t("git-settings.global")]]}>{item => <Button size="sm" variant={scope() === item[0] ? "secondary" : "outline"} aria-pressed={scope() === item[0]} disabled={pending()} onClick={() => setScope(item[0])}>{item[1]}</Button>}</For></div>
      <Show when={settings()} fallback={<p class="text-sm text-muted-foreground" role="status">{pending() ? t("git-settings.loading") : error()}</p>}>
        <form onSubmit={save} class="space-y-4">
          <For each={fields()}>{field => <div class="space-y-1">
            <Show when={field.options} fallback={<TextField value={values()[field.key] ?? ""} onChange={value => change(field.key, value)} disabled={pending()}><TextFieldLabel>{field.label}</TextFieldLabel><TextFieldInput autocomplete="off" spellcheck={false} /></TextField>}>
              <SelectField label={field.label} value={values()[field.key] ?? ""} disabled={pending()} onChange={value => change(field.key, value)}
                options={[
                  { value: "", label: t("git-settings.inherit") },
                  ...(values()[field.key] && !field.options?.some(option => option[0] === values()[field.key]) ? [{ value: values()[field.key], label: values()[field.key] }] : []),
                  ...(field.options ?? []).map(([value, label]) => ({ value, label })),
                ]} />
            </Show>
            <Show when={settings()?.effective[field.key]}>{value => <p class="break-all text-xs text-muted-foreground">{t("git-settings.effective", { value: value() })}</p>}</Show>
          </div>}</For>
          <p class="text-xs text-muted-foreground">{t("git-settings.scope-note")}</p>
          <Show when={error()}><p role="alert" class="text-sm text-destructive">{error()}</p></Show><Show when={saved()}><p role="status" class="text-sm text-muted-foreground">{t("git-settings.saved")}</p></Show>
          <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={pending()} onClick={props.onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={pending()}>{pending() ? t("git-settings.saving") : t("git-settings.save")}</Button></DialogFooter>
        </form>
      </Show>
      </Show>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
