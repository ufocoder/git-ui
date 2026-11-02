import { createContext, useContext, type JSX } from "solid-js";

export type FileActions = {
  disabled: () => boolean;
  canRestore: () => boolean;
  managerLabel: () => string;
  history: (path: string) => void;
  copy: (path: string) => void;
  reveal: (path: string) => void;
  restore: (path: string, commit?: string) => void;
};
export const FileActionsContext = createContext<FileActions>();
export const useFileActions = () => useContext(FileActionsContext);
export type FileRowRenderer = (path: string, directory: boolean, children: JSX.Element) => JSX.Element;

export function absoluteProjectPath(root: string, path: string): string {
  const separator = root.startsWith("\\\\") || /^[A-Za-z]:\\/.test(root) ? "\\" : "/";
  return root.replace(/[\\/]+$/, "") + separator + (separator === "\\" ? path.split("/").join("\\") : path);
}
