import { Show, createEffect, createSignal } from "solid-js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { theme } from "~/lib/theme-preferences";
import { t } from "~/lib/i18n";
import AppearanceSettings from "~/features/settings/appearance-settings";
import ThemeSettings from "~/features/settings/theme-settings";
import RepositoryTools from "~/features/settings/repository-tools";
import GitConfigForm, { createGitConfigForm } from "~/features/settings/git-config-form";

export default function GitSettingsDialog(props: { hasProject: boolean; repositoryOnly?: boolean; open: boolean; onClose: () => void }) {
  const [draftTheme, setDraftTheme] = createSignal(theme());
  createEffect(() => {
    if (props.open) setDraftTheme(theme());
  });
  const [languagePending, setLanguagePending] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal(props.repositoryOnly ? "git" : "appearance");
  const form = createGitConfigForm(props);
  return <Dialog open={props.open} onOpenChange={open => { if (!open && !form.pending() && !languagePending()) props.onClose(); }}>
    <DialogContent class="h-[min(640px,calc(100dvh_-_2rem))] w-[calc(100%_-_2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <DialogHeader><DialogTitle>{props.repositoryOnly ? t("git-settings.repository") : t("settings.title")}</DialogTitle><DialogDescription>{props.repositoryOnly ? t("git-settings.inherit-description") : t("settings.description")}</DialogDescription></DialogHeader>
      <Tabs value={activeTab()} onChange={setActiveTab} class="flex min-h-0 min-w-0 flex-col">
        <Show when={props.repositoryOnly && props.hasProject}>
          <TabsList class="mb-4 shrink-0 self-start px-0" aria-label={t("git-settings.repository")}>
            <TabsTrigger value="git">Git</TabsTrigger>
            <TabsTrigger value="tools">{t("repo-tools.title")}</TabsTrigger>
          </TabsList>
          <TabsContent value="tools" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
            <RepositoryTools />
          </TabsContent>
        </Show>
        <Show when={!props.repositoryOnly}><TabsList class="mb-4 shrink-0 self-start px-0" aria-label={t("settings.title")}>
          <TabsTrigger value="appearance">{t("settings.appearance")}</TabsTrigger>
          <TabsTrigger value="themes">{t("theme.tab")}</TabsTrigger>
          <TabsTrigger value="git">{t("git-settings.global")}</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
          <AppearanceSettings pending={languagePending()} setPending={setLanguagePending} />
        </TabsContent>
        <TabsContent value="themes" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
          <ThemeSettings draft={draftTheme()} select={setDraftTheme} />
        </TabsContent></Show>
        <TabsContent value="git" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 outline-none">
          <GitConfigForm form={form} repositoryOnly={props.repositoryOnly} hasProject={props.hasProject} onClose={props.onClose} />
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
