import { indexFileSelection, type FileSelectionIndex, type DirectorySelection } from "~/lib/file-selection-index";
import FileContextMenu from "./file-context-menu";
import { t } from "~/lib/i18n";
import { compareChangedFiles, type FilePresentation } from "~/lib/file-presentation";
import { createMemo, type JSX } from "solid-js";
import { FileTree } from "~/components/ui/file-tree";
import { FileStatus } from "~/components/ui/file-status";
import { sortFileTree, compactFileTree, type FileTreeNode } from "~/lib/file-tree";
import type { CommitFile } from "~/lib/git";

export type ChangedFilesTreeProps = {
  files: CommitFile[];
  fileIndex?: FileSelectionIndex;
  virtual?: boolean;
  stackedList?: boolean;
  presentation?: FilePresentation;
  commit?: string;
  selectedPath: string;
  disabled: boolean;
  onSelect: (file: CommitFile) => void;
  onSelectDirectory?: (path: string) => void;
  renderDirectoryControl?: (path: string, selection: DirectorySelection) => JSX.Element;
  renderControl?: (file: CommitFile) => JSX.Element;
};
export default function ChangedFilesTree(props: ChangedFilesTreeProps) {
  const index = createMemo(() => props.fileIndex ?? indexFileSelection(props.files));
  const nodes = createMemo(() => {
    const preference = props.presentation;
    if (!preference || (preference.view === "tree" && preference.sort === "path" && !preference.descending)) return compactFileTree(index().nodes);
    const compareFiles = (a: CommitFile, b: CommitFile) => compareChangedFiles(a, b, preference.sort);
    if (preference.view === "tree") return compactFileTree(sortFileTree(index().nodes, { compareFiles, descending: preference.descending }));
    return [...props.files].sort((a, b) => compareFiles(a, b) * (preference.descending ? -1 : 1))
      .map((file): FileTreeNode<CommitFile> => ({ kind: "file", name: file.path, path: file.path, value: file }));
  });
  return <FileTree stacked={props.stackedList} columns={props.presentation?.view === "list"} virtual={props.virtual || props.presentation?.view === "list"} renderRow={(path, _directory, children) => <FileContextMenu path={path} commit={props.commit}>{children}</FileContextMenu>} label={props.presentation?.view === "list" ? t("files.list-label") : undefined} nodes={nodes()} selectedPath={props.selectedPath} disabled={props.disabled} onSelect={props.onSelect} onSelectDirectory={props.onSelectDirectory}
    renderControl={props.renderControl}
    renderDirectoryControl={props.renderDirectoryControl ? path => { const directory = index().directories.get(path); return directory && props.renderDirectoryControl?.(path, directory); } : undefined}
    renderIcon={file => <FileStatus status={file.status} />}
    fileTitle={file => file.old_path ? `${file.old_path} → ${file.path}` : file.path} />;
}
