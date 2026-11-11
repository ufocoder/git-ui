import { uiFontScale } from "~/lib/appearance-preferences";
import ThemePreview from "./theme-preview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { themes, theme, saveTheme } from "~/lib/theme-preferences";
import { SelectField } from "~/components/ui/select";
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { git, type GitSettings } from "~/lib/git";
import { language, t, type Language } from "~/lib/i18n";
import { saveLanguage } from "~/lib/language-preferences";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

export default function GitSettingsDialog(props: { hasProject: boolean; repositoryOnly?: boolean; open: boolean; onClose: () => void }) {
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
  const [activeTab, setActiveTab] = createSignal(props.repositoryOnly ? "git" : "appearance");
  const [repositoryTools] = createResource(
    () => props.open && props.repositoryOnly && props.hasProject && activeTab() === "tools",
    async () => {
      try {
        return { data: await git.getRepositoryTools() };
      } catch (error) {
        return { error: String(error) };
      }
    },
  );
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
  return <Dialog open={props.open} onOpenChange={open => { if (!open && !pending() && !languagePending()) props.onClose(); }}>
    <DialogContent class="h-[min(640px,calc(100dvh_-_2rem))] w-[calc(100%_-_2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <DialogHeader><DialogTitle>{props.repositoryOnly ? t("git-settings.repository") : t("settings.title")}</DialogTitle><DialogDescription>{props.repositoryOnly ? t("git-settings.inherit-description") : t("settings.description")}</DialogDescription></DialogHeader>
      <Tabs value={activeTab()} onChange={setActiveTab} class="flex min-h-0 min-w-0 flex-col">
        <Show when={props.repositoryOnly && props.hasProject}>
          <TabsList class="mb-4 shrink-0 self-start px-0" aria-label={t("git-settings.repository")}>
            <TabsTrigger value="git">Git</TabsTrigger>
            <TabsTrigger value="tools">{t("repo-tools.title")}</TabsTrigger>
          </TabsList>
          <TabsContent value="tools" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
            <Show when={!repositoryTools.loading} fallback={<p role="status" class="text-sm text-muted-foreground">{t("git-settings.loading")}</p>}>
              <Show when={repositoryTools()?.error}>{error => <p role="alert" class="text-sm text-destructive">{error()}</p>}</Show>
              <Show when={repositoryTools()?.data}>{data => <>
                <section class="space-y-1">
                  <h3 class="text-sm font-medium">Git LFS</h3>
                  <p class="text-sm text-muted-foreground">{data().lfs_available ? t("repo-tools.lfs-installed") : t("repo-tools.lfs-missing")}</p>
                </section>
                <section class="space-y-1">
                  <h3 class="text-sm font-medium">{t("repo-tools.hooks")}</h3>
                  <code class="block break-all select-text text-xs text-muted-foreground">{data().hooks_path}</code>
                  <Show when={data().hooks.length} fallback={<p class="text-sm text-muted-foreground">{t("repo-tools.no-hooks")}</p>}>
                    <ul class="space-y-1 text-sm"><For each={data().hooks}>{hook => <li class="break-all">{hook}</li>}</For></ul>
                  </Show>
                </section>
              </>}</Show>
            </Show>
            <DialogFooter><Button type="button" variant="outline" onClick={props.onClose}>{t("update.close")}</Button></DialogFooter>
          </TabsContent>
        </Show>
        <Show when={!props.repositoryOnly}><TabsList class="mb-4 shrink-0 self-start px-0" aria-label={t("settings.title")}>
          <TabsTrigger value="appearance">{t("settings.appearance")}</TabsTrigger>
          <TabsTrigger value="themes">{t("theme.tab")}</TabsTrigger>
          <TabsTrigger value="git">{t("git-settings.global")}</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
      <SelectField label={t("language.title")} value={language()} disabled={languagePending()} onChange={value => void chooseLanguage(value as Language)}
        options={[{ value: "ru", label: t("language.russian") }, { value: "en", label: t("language.english") }]} />
      <Show when={languageError()}><p role="alert" class="text-sm text-destructive">{t("language.save-error", { error: languageError() })}</p></Show>
      <SelectField label={t("appearance.font-size")} value={String(uiFontScale.value())} onChange={value => uiFontScale.save(Number(value))}
        options={uiFontScale.choices.map((value, index) => ({
          value: String(value),
          label: [t("appearance.font-small"), t("appearance.font-below-medium"), t("appearance.font-medium"), t("appearance.font-above-medium"), t("appearance.font-large")][index],
        }))} />
      <DialogFooter><Button type="button" variant="outline" disabled={languagePending()} onClick={props.onClose}>{t("update.close")}</Button></DialogFooter>
        </TabsContent>
        <TabsContent value="themes" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
          <fieldset class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <legend class="sr-only">{t("theme.title")}</legend>
            <For each={themes}>{item => (
              <label class="relative min-w-0 cursor-pointer">
                <input
                  type="radio"
                  name="app-color-theme"
                  class="peer sr-only"
                  value={item.id}
                  checked={draftTheme() === item.id}
                  onChange={() => setDraftTheme(item.id)}
                />
                <span class="block space-y-2 rounded-lg border p-2 hover:bg-muted peer-checked:border-primary peer-checked:bg-muted peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-primary">
                  <span class="flex items-center justify-between gap-2 px-1 text-sm font-medium">
                    {item.id === "default" ? t("theme.light") : item.id === "dark" ? t("theme.dark") : item.name}
                    <Show when={draftTheme() === item.id}><span aria-hidden="true" class="text-primary">✓</span></Show>
                  </span>
                  <ThemePreview theme={item.id} dark={item.dark} />
                </span>
              </label>
            )}</For>
          </fieldset>
          <DialogFooter class="gap-2">
            <Button type="button" variant="outline" onClick={props.onClose}>{t("update.close")}</Button>
            <Button type="button" disabled={draftTheme() === theme()} onClick={() => saveTheme(draftTheme())}>{t("theme.apply")}</Button>
          </DialogFooter>
        </TabsContent></Show>
        <TabsContent value="git" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
      <Show when={!props.repositoryOnly || props.hasProject} fallback={<div class="space-y-4"><p class="text-sm text-muted-foreground">{t("settings.open-repository")}</p><DialogFooter><Button type="button" variant="outline" onClick={props.onClose}>{t("update.close")}</Button></DialogFooter></div>}>
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
      </Show>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
