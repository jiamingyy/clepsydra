export type EnvMode =
  | { type: "plain"; pythonExecutable: string | null }
  | { type: "uv"; noSync: boolean };

export type RunMode =
  | { type: "long_running" }
  | { type: "cron"; expr: string }
  | { type: "interval"; secs: number };

export interface RestartPolicy {
  maxRestarts: number;
  restartDelaySecs: number;
  resetWindowSecs: number;
}

export interface LogConfig {
  maxFileMb: number;
  maxFiles: number;
}

export interface TaskConfig {
  id: string;
  name: string;
  envMode: EnvMode;
  scriptPath: string;
  workdir: string | null;
  args: string[];
  envVars: Record<string, string>;
  runMode: RunMode;
  restartPolicy: RestartPolicy;
  logConfig: LogConfig;
  enabled: boolean;
  createdAt: number;
}

export type TaskStatus =
  | "disabled"
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "waitingRestart"
  | "failed"
  | "exited";

export interface ExitInfo {
  code: number | null;
  success: boolean;
  time: number;
  detail: string | null;
}

export interface RuntimeState {
  status: TaskStatus;
  pid: number | null;
  startedAt: number | null;
  restartCount: number;
  lastExit: ExitInfo | null;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunFinishedAt: number | null;
  dashboard: unknown;
  dashboardAt: number | null;
  lastError: string | null;
}

export interface TaskWithState {
  config: TaskConfig;
  state: RuntimeState;
}

export interface AppSettings {
  reportPort: number;
  token: string;
  uvPath: string;
}

export interface SettingsInfo {
  settings: AppSettings;
  dataDir: string;
  reportUrl: string | null;
  reportError: string | null;
  uvVersion: string | null;
}

export function newTaskDraft(): TaskConfig {
  return {
    id: "",
    name: "",
    envMode: { type: "plain", pythonExecutable: null },
    scriptPath: "",
    workdir: null,
    args: [],
    envVars: {},
    runMode: { type: "long_running" },
    restartPolicy: { maxRestarts: 3, restartDelaySecs: 5, resetWindowSecs: 300 },
    logConfig: { maxFileMb: 5, maxFiles: 3 },
    enabled: true,
    createdAt: 0,
  };
}

export function cloneTask(t: TaskConfig): TaskConfig {
  return JSON.parse(JSON.stringify(t)) as TaskConfig;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  disabled: "已停止",
  idle: "待调度",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  waitingRestart: "等待重启",
  failed: "已失败",
  exited: "已结束",
};

export function isActiveStatus(s: TaskStatus): boolean {
  return (
    s === "running" ||
    s === "starting" ||
    s === "stopping" ||
    s === "waitingRestart" ||
    s === "idle"
  );
}
