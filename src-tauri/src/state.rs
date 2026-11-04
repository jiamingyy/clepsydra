use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use tauri::Emitter;

use crate::config::{AppSettings, RuntimeState, TaskConfig, TaskStatus, TaskWithState};
use crate::persist::{self, PersistFile, PersistedTask};

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// 单个任务的内存条目：配置 + 运行状态 + 控制句柄
pub struct TaskEntry {
    pub config: TaskConfig,
    pub rt: RuntimeState,
    /// 日志环形缓冲（跨运行保留，供前端拉取历史）
    pub log_buf: Arc<Mutex<VecDeque<String>>>,
    /// 停止信号通道
    pub stop_tx: Option<tokio::sync::mpsc::UnboundedSender<()>>,
    /// 监控/调度协程句柄（应用退出时 abort 以杀掉子进程）
    pub handles: Vec<tauri::async_runtime::JoinHandle<()>>,
    /// 代数：每次启动/停止 +1，旧协程发现代数不匹配即自行退出，避免竞态
    pub generation: u64,
}

impl TaskEntry {
    pub fn new(config: TaskConfig) -> Self {
        Self {
            config,
            rt: RuntimeState::default(),
            log_buf: Arc::new(Mutex::new(VecDeque::new())),
            stop_tx: None,
            handles: Vec::new(),
            generation: 0,
        }
    }
}

pub struct Inner {
    pub settings: AppSettings,
    pub tasks: HashMap<String, TaskEntry>,
    pub report_url: Option<String>,
    pub report_error: Option<String>,
}

pub struct AppState {
    pub app: tauri::AppHandle,
    pub data_dir: PathBuf,
    pub inner: RwLock<Inner>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn snapshot_tasks(&self) -> Vec<TaskWithState> {
        let inner = self.inner.read().unwrap();
        let mut v: Vec<TaskWithState> = inner
            .tasks
            .values()
            .map(|e| TaskWithState { config: e.config.clone(), state: e.rt.clone() })
            .collect();
        v.sort_by(|a, b| a.config.created_at.cmp(&b.config.created_at));
        v
    }

    pub fn task_snapshot(&self, id: &str) -> Option<TaskWithState> {
        let inner = self.inner.read().unwrap();
        inner.tasks.get(id).map(|e| TaskWithState { config: e.config.clone(), state: e.rt.clone() })
    }

    pub fn log_buf_of(&self, id: &str) -> Arc<Mutex<VecDeque<String>>> {
        self.inner
            .read()
            .unwrap()
            .tasks
            .get(id)
            .map(|e| e.log_buf.clone())
            .unwrap_or_default()
    }
}

/// 初始化：加载持久化数据，清理易变字段
pub fn init(app: tauri::AppHandle, data_dir: PathBuf) -> SharedState {
    let loaded = persist::load(&data_dir);
    let mut settings = loaded.settings.unwrap_or_default();
    if settings.token.trim().is_empty() {
        settings.token = uuid::Uuid::new_v4().simple().to_string();
    }
    let mut tasks = HashMap::new();
    for p in loaded.tasks {
        let id = p.config.id.clone();
        let mut rt = p.runtime;
        rt.pid = None;
        rt.started_at = None;
        rt.next_run_at = None;
        // 重启后状态由监控协程重新推进；此处先按 enabled 预置
        rt.status = if p.config.enabled { TaskStatus::Starting } else { TaskStatus::Disabled };
        let mut entry = TaskEntry::new(p.config);
        entry.rt = rt;
        tasks.insert(id, entry);
    }
    // 上报地址由端口确定性推导，在任务恢复前预先写入，
    // 避免「任务先于 HTTP 服务绑定启动」时注入空的 CLEPSYDRA_REPORT_URL
    let report_url = Some(format!("http://127.0.0.1:{}/report", settings.report_port));
    Arc::new(AppState {
        app,
        data_dir,
        inner: RwLock::new(Inner { settings, tasks, report_url, report_error: None }),
    })
}

/// 读取配置（代数校验）
pub fn snapshot_config(state: &SharedState, id: &str, generation: u64) -> Option<TaskConfig> {
    let inner = state.inner.read().unwrap();
    let e = inner.tasks.get(id)?;
    if e.generation != generation {
        return None;
    }
    Some(e.config.clone())
}

/// 更新运行状态（代数校验，防止旧协程写入）
pub fn update_rt<F: FnOnce(&mut RuntimeState)>(state: &SharedState, id: &str, generation: u64, f: F) -> bool {
    let mut inner = state.inner.write().unwrap();
    match inner.tasks.get_mut(id) {
        Some(e) if e.generation == generation => {
            f(&mut e.rt);
            true
        }
        _ => false,
    }
}

pub fn set_status(state: &SharedState, id: &str, generation: u64, s: TaskStatus) -> bool {
    update_rt(state, id, generation, |rt| rt.status = s)
}

/// 推送单个任务状态快照给前端
pub fn emit_one(state: &SharedState, id: &str) {
    if let Some(p) = state.task_snapshot(id) {
        let _ = state.app.emit("clepsydra://status", p);
    }
}

/// 持久化全部任务与设置
pub fn persist(state: &SharedState) {
    let file = {
        let inner = state.inner.read().unwrap();
        PersistFile {
            version: 1,
            settings: Some(inner.settings.clone()),
            tasks: inner
                .tasks
                .values()
                .map(|e| PersistedTask { config: e.config.clone(), runtime: e.rt.clone() })
                .collect(),
        }
    };
    if let Ok(bytes) = serde_json::to_vec_pretty(&file) {
        if let Err(e) = persist::write_atomic(&state.data_dir.join("tasks.json"), &bytes) {
            eprintln!("[clepsydra] 持久化失败: {e}");
        }
    }
}

/// 应用退出时：通知所有协程停止并 abort（kill_on_drop 会杀掉子进程）
pub fn shutdown_all(state: &SharedState) {
    let mut inner = state.inner.write().unwrap();
    for (_, e) in inner.tasks.iter_mut() {
        e.generation += 1;
        if let Some(tx) = e.stop_tx.take() {
            let _ = tx.send(());
        }
        for h in e.handles.drain(..) {
            h.abort();
        }
    }
}
