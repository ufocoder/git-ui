import { Show, type JSX } from "solid-js";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "~/components/ui/context-menu";
import { useFileActions } from "~/lib/file-actions-context";
import { WORKTREE } from "~/lib/git";
import { t } from "~/lib/i18n";

export default function FileContextMenu(props: { path: string; commit?: string; children: JSX.Element }) {
  const actions = useFileActions();
  if (!actions) return props.children;
  return <ContextMenu>
    <ContextMenuTrigger as="div">{props.children}</ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem disabled={actions.disabled()} onSelect={() => actions.history(props.path)}>{t("file-action.history")}</ContextMenuItem>
      <ContextMenuItem disabled={actions.disabled()} onSelect={() => actions.copy(props.path)}>{t("file-action.copy-path")}</ContextMenuItem>
      <ContextMenuItem disabled={actions.disabled()} onSelect={() => actions.reveal(props.path)}>{actions.managerLabel()}</ContextMenuItem>
      <ContextMenuSeparator />
      <Show when={actions.discard && (!props.commit || props.commit === WORKTREE)}>
        <ContextMenuItem class="text-destructive" disabled={actions.disabled() || !actions.canRestore()} onSelect={() => actions.discard?.(props.path)}>{t("discard.path-action")}</ContextMenuItem>
      </Show>
      <ContextMenuItem disabled={actions.disabled() || !actions.canRestore()} onSelect={() => actions.restore(props.path, props.commit)}>{t("discard.restore-from-commit")}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}
