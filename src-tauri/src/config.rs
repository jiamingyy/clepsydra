use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 任务执行环境
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum EnvMode {
    /// 普通 Python 解释器直接运行
    Plain {
        /// Python 可执行文件，为空时使用 "python"
        #[serde(default)]
        python_executable: Option<String>,
    },
    /// 使用 uv 虚拟环境运行（uv run）
    Uv {
        /// 为 true 时追加 --no-sync，跳过依赖同步（要求 .venv 已就绪）
        #[serde(default)]
        no_sync: bool,
    },
}

/// 任务运行模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum RunMode {
    /// 长期运行（守护式），异常退出按重启策略自动拉起
    LongRunning,
    /// cron 定时（5 字段 分 时 日 月 周；也支持 6/7 字段带秒）
    Cron { expr: String },
    /// 固定间隔（秒）
    Interval { secs: u64 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RestartPolicy {
    /// 连续异常退出的自动重启次数上限
    pub max_restarts: u32,
    /// 重启前等待秒数
    pub restart_delay_secs: u64,
    /// 进程存活超过该窗口（秒）则重置重启计数
    pub reset_window_secs: u64,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        Self { max_restarts: 3, restart_delay_secs: 5, reset_window_secs: 300 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogConfig {
    /// 单个日志文件大小上限（MB），超过后轮转
    pub max_file_mb: u64,
    /// 保留的轮转文件数量
    pub max_files: u32,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self { max_file_mb: 5, max_files: 3 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_env_mode")]
    pub env_mode: EnvMode,
    #[serde(default)]
    pub script_path: String,
    #[serde(default)]
    pub workdir: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    #[serde(default = "default_run_mode")]
    pub run_mode: RunMode,
    #[serde(default)]
    pub restart_policy: RestartPolicy,
    #[serde(default)]
    pub log_config: LogConfig,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub created_at: i64,
}

fn default_env_mode() -> EnvMode {
    EnvMode::Plain { python_executable: None }
}
fn default_run_mode() -> RunMode {
    RunMode::LongRunning
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    #[default]
    Disabled,
    /// 定时任务等待下一次触发
    Idle,
    Starting,
    Running,
    Stopping,
    /// 异常退出后等待自动重启
    WaitingRestart,
    /// 超过重启上限 / 配置错误
    Failed,
    /// 正常退出（退出码 0），生命周期自然结束，不自动重启
    Exited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitInfo {
    pub code: Option<i32>,
    pub success: bool,
    pub time: i64,
    pub detail: Option<String>,
}

/// 任务运行状态（内存 + 持久化快照）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeState {
    pub status: TaskStatus,
    pub pid: Option<u32>,
    pub started_at: Option<i64>,
    pub restart_count: u32,
    pub last_exit: Option<ExitInfo>,
    pub next_run_at: Option<i64>,
    pub last_run_at: Option<i64>,
    pub last_run_finished_at: Option<i64>,
    /// 任务脚本上报的自定义展示数据
    pub dashboard: Option<serde_json::Value>,
    pub dashboard_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWithState {
    pub config: TaskConfig,
    pub state: RuntimeState,
}

/// 应用级设置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// 本地上报 HTTP 服务端口
    pub report_port: u16,
    /// 上报鉴权 token（随任务环境变量下发）
    pub token: String,
    /// uv 可执行文件路径
    pub uv_path: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            report_port: 17321,
            token: uuid::Uuid::new_v4().simple().to_string(),
            uv_path: "uv".to_string(),
        }
    }
}
