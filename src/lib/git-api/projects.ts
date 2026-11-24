import type { GitSettings, GitSettingChange, OpenProjectResult, TerminalLog } from "../git-types";
import { request } from "./transport";
import { invoke } from "@tauri-apps/api/core";

export const projectsApi = {
  fileActionsPlatform: () => invoke<string>("file_actions_platform"),
  openProjectRemote: (remote: string) => request<void>("open_project_remote", { remote }),
  revealPath: (file?: string) => request<void>("reveal_project_path", { file }),
  checkInstallation: () => invoke<{ available: boolean; platform: string }>("get_git_installation"),
  getRepositoryTools: () => request<{ lfs_available: boolean; hooks_path: string; hooks: string[] }>("get_repository_tools"),
  getSettings: (scope: string) => request<GitSettings>("get_git_settings", { scope }),
  saveSettings: (scope: string, changes: GitSettingChange[]) => request<GitSettings>("save_git_settings", { scope, changes }),
  showProjectChooser: () => request<void>("show_project_chooser"),
  projectDirectoryExists: (path: string) => request<boolean>("project_directory_exists", { path }),
  removeMissingRecentProject: (path: string) => request<string[]>("remove_missing_recent_project", { path }),
  getRecentProjects: () => request<string[]>("get_recent_projects"),
  canInitializeProject: (path: string) => request<boolean>("can_initialize_project", { path }),
  initializeProject: (path: string) => request<void>("initialize_project", { path }),
  openProject: (path: string) => request<OpenProjectResult>("open_project", { path }),
  getTerminalLog: () => request<TerminalLog | null>("get_project_terminal_log"),
};
