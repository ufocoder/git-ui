import type { JSX } from "solid-js";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "~/components/ui/context-menu";
import { useFileActions } from "~/lib/file-actions-context";
import { t } from "~/lib/i18n";

export default function FileContextMenu(props: { path: string; commit?: string; children: JSX.Element }) {
  const actions = useFileActions();
  if (!actions) return props.children;
  return <ContextMenu>
    <ContextMenuTrigger as="div">{props.children}</ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem disabled={actions.disabled()} onSelect={() => actions.history(props.path)}>{t("fileAct01")}</ContextMenuItem>
      <ContextMenuItem disabled={actions.disabled()} onSelect={() => actions.copy(props.path)}>{t("fileAct02")}</ContextMenuItem>
      <ContextMenuItem disabled={actions.disabled() || !actions.canRestore()} onSelect={() => actions.restore(props.path, props.commit)}>{t("fileAct03")}</ContextMenuItem>
      <ContextMenuItem disabled={actions.disabled()} onSelect={() => actions.reveal(props.path)}>{actions.managerLabel()}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}
