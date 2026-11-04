import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, SettingsInfo, TaskConfig, TaskWithState } from "./types";

export const api = {
  listTasks: () => invoke<TaskWithState[]>("list_tasks"),
  createTask: (config: TaskConfig) => invoke<TaskWithState>("create_task", { config }),
  updateTask: (id: string, config: TaskConfig) => invoke<TaskWithState>("update_task", { id, config }),
  deleteTask: (id: string, removeLogs: boolean) => invoke<void>("delete_task", { id, removeLogs }),
  startTask: (id: string) => invoke<void>("start_task", { id }),
  stopTask: (id: string) => invoke<void>("stop_task", { id }),
  restartTask: (id: string) => invoke<void>("restart_task", { id }),
  getLogHistory: (id: string, maxLines: number) => invoke<string[]>("get_log_history", { id, maxLines }),
  clearDashboard: (id: string) => invoke<void>("clear_dashboard", { id }),
  getSettings: () => invoke<SettingsInfo>("get_settings"),
  updateSettings: (settings: AppSettings) => invoke<void>("update_settings", { settings }),
  regenerateToken: () => invoke<string>("regenerate_token"),
  previewCron: (expr: string) => invoke<string[]>("preview_cron", { expr }),
};
