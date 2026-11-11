import { For, Show, createResource } from "solid-js";
import { git } from "~/lib/git";
import { t } from "~/lib/i18n";

export default function RepositoryTools() {
  const [repositoryTools] = createResource(
    async () => {
      try {
        return { data: await git.getRepositoryTools() };
      } catch (error) {
        return { error: String(error) };
      }
    },
  );
  return <Show when={!repositoryTools.loading} fallback={<p role="status" class="text-sm text-muted-foreground">{t("git-settings.loading")}</p>}>
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
  </Show>;
}
