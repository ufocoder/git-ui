import { createMemo, type JSX } from "solid-js";
import { FileTree } from "~/components/ui/file-tree";
import { FileStatus } from "~/components/ui/file-status";
import { buildFileTree } from "~/lib/file-tree";
import type { CommitFile } from "~/lib/git";

type ChangedFilesTreeProps = {
  files: CommitFile[];
  selectedPath: string;
  disabled: boolean;
  onSelect: (file: CommitFile) => void;
  renderDirectoryControl?: (path: string, files: CommitFile[]) => JSX.Element;
  renderControl?: (file: CommitFile) => JSX.Element;
};
export default function ChangedFilesTree(props: ChangedFilesTreeProps) {
  const nodes = createMemo(() => buildFileTree(props.files));
  return <FileTree nodes={nodes()} selectedPath={props.selectedPath} disabled={props.disabled} onSelect={props.onSelect}
    renderControl={props.renderControl}
    renderDirectoryControl={props.renderDirectoryControl ? path => props.renderDirectoryControl?.(path, props.files.filter(file => file.path.startsWith(path + "/"))) : undefined}
    renderIcon={file => <FileStatus status={file.status} />}
    fileTitle={file => file.old_path ? `${file.old_path} → ${file.path}` : file.path} />;
}
