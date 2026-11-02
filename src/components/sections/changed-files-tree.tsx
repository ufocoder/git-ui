import FileContextMenu from "./file-context-menu";
import { t } from "~/lib/i18n";
import { compareChangedFiles, type FilePresentation } from "~/lib/file-presentation";
import { createMemo, type JSX } from "solid-js";
import { FileTree } from "~/components/ui/file-tree";
import { FileStatus } from "~/components/ui/file-status";
import { buildFileTree, type FileTreeNode } from "~/lib/file-tree";
import type { CommitFile } from "~/lib/git";

type ChangedFilesTreeProps = {
  files: CommitFile[];
  presentation?: FilePresentation;
  commit?: string;
  selectedPath: string;
  disabled: boolean;
  onSelect: (file: CommitFile) => void;
  onSelectDirectory?: (path: string) => void;
  renderDirectoryControl?: (path: string, files: CommitFile[]) => JSX.Element;
  renderControl?: (file: CommitFile) => JSX.Element;
};
export default function ChangedFilesTree(props: ChangedFilesTreeProps) {
  const nodes = createMemo(() => {
    const preference = props.presentation;
    if (!preference) return buildFileTree(props.files);
    const compareFiles = (a: CommitFile, b: CommitFile) => compareChangedFiles(a, b, preference.sort);
    if (preference.view === "tree") return buildFileTree(props.files, { compareFiles, descending: preference.descending });
    return [...props.files].sort((a, b) => compareFiles(a, b) * (preference.descending ? -1 : 1))
      .map((file): FileTreeNode<CommitFile> => ({ kind: "file", name: file.path, path: file.path, value: file }));
  });
  return <FileTree renderRow={(path, _directory, children) => <FileContextMenu path={path} commit={props.commit}>{children}</FileContextMenu>} label={props.presentation?.view === "list" ? t("files11") : undefined} nodes={nodes()} selectedPath={props.selectedPath} disabled={props.disabled} onSelect={props.onSelect} onSelectDirectory={props.onSelectDirectory}
    renderControl={props.renderControl}
    renderDirectoryControl={props.renderDirectoryControl ? path => props.renderDirectoryControl?.(path, props.files.filter(file => file.path.startsWith(path + "/"))) : undefined}
    renderIcon={file => <FileStatus status={file.status} />}
    fileTitle={file => file.old_path ? `${file.old_path} → ${file.path}` : file.path} />;
}
