import { Channel, invoke } from "@tauri-apps/api/core";

export type UpdateSettings = { repository: string; currentVersion: string };
export type UpdateInfo = {
  currentVersion: string;
  version: string | null;
  notes: string | null;
  available: boolean;
  installable: boolean;
  notice: string | null;
  releaseUrl: string | null;
};
export type UpdateProgress = { phase: "downloading" | "installing" | "restarting"; downloaded: number; total: number | null };
export const updates = {
  settings: () => invoke<UpdateSettings>("get_update_settings"),
  check: (repository: string) => invoke<UpdateInfo>("check_app_update", { repository }),
  install: (onProgress: (progress: UpdateProgress) => void) => {
    const onProgressChannel = new Channel<UpdateProgress>();
    onProgressChannel.onmessage = onProgress;
    return invoke<void>("install_app_update", { onProgress: onProgressChannel });
  },
};
