use std::path::{Path, PathBuf};
use std::process::ExitStatus;
use std::time::Duration;

use chrono::{DateTime, Local};
use tokio::process::{Child, Command};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

use crate::config::{EnvMode, ExitInfo, RunMode, TaskConfig, TaskStatus};
use crate::logwriter::{read_stream, log_pump, LogLine, LogWriter};
use crate::state::{emit_one, now_ms, persist, set_status, snapshot_config, update_rt, SharedState};

/// 解析 cron 表达式：5 字段（分 时 日 月 周）自动补秒位，也支持 6/7 字段
pub fn parse_cron(expr: &str) -> Result<cron::Schedule, String> {
    use std::str::FromStr;
    let expr = expr.trim();
    let fields = expr.split_whitespace().count();
    if !(5..=7).contains(&fields) {
        return Err(format!("cron 表达式应为 5~7 个字段: \"{expr}\""));
    }
    let full = if fields == 5 { format!("0 {expr}") } else { expr.to_string() };
    cron::Schedule::from_str(&full).map_err(|e| format!("cron 表达式无效: {e}"))
}

fn compute_next(mode: &RunMode) -> Result<DateTime<Local>, String> {
    match mode {
        RunMode::Cron { expr } => parse_cron(expr)?
            .after(&Local::now())
            .next()
            .ok_or_else(|| "无法计算下次运行时间".to_string()),
        RunMode::Interval { secs } => {
            if *secs == 0 {
                Err("间隔必须大于 0 秒".to_string())
            } else {
                Ok(Local::now() + chrono::Duration::seconds(*secs as i64))
            }
        }
        RunMode::LongRunning => Err("长期运行模式不支持调度".to_string()),
    }
}

/// 激活任务：按运行模式启动守护协程（长期运行）或调度协程（定时）
pub fn activate(state: &SharedState, id: &str) -> Result<(), String> {
    let (generation, mode, rx) = {
        let mut inner = state.inner.write().unwrap();
        let e = inner
            .tasks
            .get_mut(id)
            .ok_or_else(|| "任务不存在".to_string())?;
        e.generation += 1;
        e.stop_tx = None;
        e.handles.clear();
        let (tx, rx) = mpsc::unbounded_channel();
        e.stop_tx = Some(tx);
        (e.generation, e.config.run_mode.clone(), rx)
    };

    let s = state.clone();
    let id2 = id.to_string();
    let handle = match mode {
        RunMode::LongRunning => tauri::async_runtime::spawn(supervise(s, id2, generation, rx)),
        _ => tauri::async_runtime::spawn(schedule(s, id2, generation, rx)),
    };
    let mut inner = state.inner.write().unwrap();
    if let Some(e) = inner.tasks.get_mut(id) {
        e.handles.push(handle);
    }
    Ok(())
}

/// 停用任务：作废旧协程（代数 +1）、发送停止信号、状态置为 Disabled
pub fn deactivate(state: &SharedState, id: &str) {
    let mut inner = state.inner.write().unwrap();
    if let Some(e) = inner.tasks.get_mut(id) {
        e.generation += 1;
        if let Some(tx) = e.stop_tx.take() {
            let _ = tx.send(());
        }
        e.handles.clear();
        e.rt.status = TaskStatus::Disabled;
        e.rt.pid = None;
        e.rt.started_at = None;
        e.rt.next_run_at = None;
        e.rt.last_error = None;
    }
}

fn effective_workdir(cfg: &TaskConfig) -> Option<PathBuf> {
    if let Some(w) = cfg.workdir.as_deref() {
        let w = w.trim();
        if !w.is_empty() {
            return Some(PathBuf::from(w));
        }
    }
    // uv 模式默认使用脚本所在目录作为项目目录
    if matches!(cfg.env_mode, EnvMode::Uv { .. }) {
        let p = Path::new(cfg.script_path.trim());
        if let Some(parent) = p.parent() {
            if !parent.as_os_str().is_empty() {
                return Some(parent.to_path_buf());
            }
        }
    }
    None
}

fn build_command(state: &SharedState, id: &str, cfg: &TaskConfig, workdir: &Option<PathBuf>) -> Command {
    let (uv_path, report_url, report_port, token) = {
        let inner = state.inner.read().unwrap();
        (
            inner.settings.uv_path.clone(),
            inner.report_url.clone().unwrap_or_default(),
            inner.settings.report_port,
            inner.settings.token.clone(),
        )
    };
    let script = cfg.script_path.trim();
    let mut cmd = match &cfg.env_mode {
        EnvMode::Plain { python_executable } => {
            let mut c = Command::new(python_executable.clone().unwrap_or_else(|| "python".to_string()));
            c.arg(script);
            c
        }
        EnvMode::Uv { no_sync } => {
            let mut c = Command::new(uv_path);
            c.arg("run");
            if let Some(wd) = workdir {
                c.arg("--directory").arg(wd);
            }
            if *no_sync {
                c.arg("--no-sync");
            }
            c.arg(script);
            c
        }
    };
    cmd.args(&cfg.args);
    if let Some(wd) = workdir {
        cmd.current_dir(wd);
    }
    for (k, v) in &cfg.env_vars {
        cmd.env(k, v);
    }
    cmd.env("CLEPSYDRA_TASK_ID", id)
        .env("CLEPSYDRA_TASK_NAME", &cfg.name)
        .env("CLEPSYDRA_REPORT_URL", report_url)
        .env("CLEPSYDRA_REPORT_PORT", report_port.to_string())
        .env("CLEPSYDRA_TOKEN", token)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8");
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    cmd
}

/// 一次进程运行的所有句柄
struct ActiveRun {
    child: Child,
    tx: UnboundedSender<LogLine>,
}

async fn spawn_run(state: &SharedState, id: &str, cfg: &TaskConfig) -> Result<ActiveRun, String> {
    if cfg.script_path.trim().is_empty() {
        return Err("脚本路径为空".to_string());
    }
    let workdir = effective_workdir(cfg);
    if let Some(wd) = &workdir {
        if !wd.is_dir() {
            return Err(format!("工作目录不存在: {}", wd.display()));
        }
    }

    let (log_tx, log_rx) = mpsc::unbounded_channel::<LogLine>();
    let dir = state.data_dir.join("logs").join(&cfg.id);
    let writer = LogWriter::open(&dir, cfg.log_config.max_file_mb, cfg.log_config.max_files)
        .map_err(|e| format!("无法打开日志文件: {e}"))?;
    let buf = state.log_buf_of(id);
    tauri::async_runtime::spawn(log_pump(state.app.clone(), id.to_string(), buf, log_rx, writer));
    let _ = log_tx.send(LogLine {
        tag: "sys",
        text: format!("==== 启动任务 \"{}\" ====", cfg.name),
    });

    let mut child = build_command(state, id, cfg, &workdir).spawn().map_err(|e| {
        let msg = format!("进程启动失败: {e}");
        let _ = log_tx.send(LogLine { tag: "sys", text: msg.clone() });
        msg
    })?;

    let pid = child.id();
    let _ = log_tx.send(LogLine {
        tag: "sys",
        text: format!("进程已启动 (pid: {})", pid.map(|p| p.to_string()).unwrap_or_else(|| "?".into())),
    });
    if let Some(out) = child.stdout.take() {
        tauri::async_runtime::spawn(read_stream(out, "out", log_tx.clone()));
    }
    if let Some(err) = child.stderr.take() {
        tauri::async_runtime::spawn(read_stream(err, "err", log_tx.clone()));
    }
    Ok(ActiveRun { child, tx: log_tx })
}

fn record_exit(state: &SharedState, id: &str, generation: u64, status: ExitStatus, tx: &UnboundedSender<LogLine>) {
    let code = status.code();
    let success = status.success();
    let line = match code {
        Some(c) => format!("进程退出，退出码 {c}"),
        None => "进程退出（被信号终止）".to_string(),
    };
    let _ = tx.send(LogLine { tag: "sys", text: line });
    update_rt(state, id, generation, |rt| {
        rt.pid = None;
        rt.started_at = None;
        rt.last_exit = Some(ExitInfo { code, success, time: now_ms(), detail: None });
    });
    emit_one(state, id);
}

/// 长期运行任务的守护协程：启动 → 监控 → 异常退出按策略重启
async fn supervise(state: SharedState, id: String, generation: u64, mut stop_rx: UnboundedReceiver<()>) {
    loop {
        let Some(cfg) = snapshot_config(&state, &id, generation) else { return };
        if !cfg.enabled {
            set_status(&state, &id, generation, TaskStatus::Disabled);
            emit_one(&state, &id);
            return;
        }
        update_rt(&state, &id, generation, |rt| {
            rt.status = TaskStatus::Starting;
            rt.last_error = None;
        });
        emit_one(&state, &id);

        let run = match spawn_run(&state, &id, &cfg).await {
            Ok(r) => r,
            Err(e) => {
                update_rt(&state, &id, generation, |rt| {
                    rt.status = TaskStatus::Failed;
                    rt.last_error = Some(e);
                    rt.pid = None;
                    rt.started_at = None;
                });
                emit_one(&state, &id);
                persist(&state);
                return;
            }
        };

        let started = now_ms();
        let ActiveRun { mut child, tx } = run;
        let pid = child.id();
        update_rt(&state, &id, generation, |rt| {
            rt.status = TaskStatus::Running;
            rt.pid = pid;
            rt.started_at = Some(started);
        });
        emit_one(&state, &id);
        persist(&state);

        // 等待进程退出或收到停止信号
        let exit_result = tokio::select! {
            res = child.wait() => Some(res),
            _ = stop_rx.recv() => {
                update_rt(&state, &id, generation, |rt| rt.status = TaskStatus::Stopping);
                emit_one(&state, &id);
                let _ = child.start_kill();
                Some(child.wait().await)
            }
        };

        let mut exited_ok = false;
        match exit_result {
            Some(Ok(status)) => {
                record_exit(&state, &id, generation, status, &tx);
                exited_ok = status.success();
                if exited_ok {
                    let _ = tx.send(LogLine {
                        tag: "sys",
                        text: "进程正常退出（退出码 0），任务已结束".to_string(),
                    });
                }
            }
            Some(Err(e)) => {
                let _ = tx.send(LogLine { tag: "sys", text: format!("等待进程退出失败: {e}") });
                update_rt(&state, &id, generation, |rt| {
                    rt.pid = None;
                    rt.started_at = None;
                    rt.last_exit = Some(ExitInfo { code: None, success: false, time: now_ms(), detail: Some(e.to_string()) });
                });
                emit_one(&state, &id);
            }
            None => {}
        }
        drop(tx); // 关闭日志通道，让日志泵收尾

        // 停止信号触发：由 deactivate 统一设置 Disabled，这里直接退出
        if !snapshot_config(&state, &id, generation).map(|c| c.enabled).unwrap_or(false) {
            return;
        }

        // 正常退出：生命周期自然结束，进入「已结束」状态，不自动重启
        if exited_ok {
            update_rt(&state, &id, generation, |rt| {
                rt.status = TaskStatus::Exited;
                rt.next_run_at = None;
                rt.restart_count = 0;
            });
            emit_one(&state, &id);
            persist(&state);
            return;
        }

        // ---- 异常退出自动重启策略 ----
        let policy = snapshot_config(&state, &id, generation).map(|c| c.restart_policy.clone()).unwrap_or_default();
        let uptime_ms = now_ms().saturating_sub(started).max(0) as u64;
        let count = {
            let mut inner = state.inner.write().unwrap();
            match inner.tasks.get_mut(&id) {
                Some(e) if e.generation == generation => {
                    if uptime_ms >= policy.reset_window_secs.saturating_mul(1000) {
                        e.rt.restart_count = 0;
                    }
                    e.rt.restart_count += 1;
                    e.rt.restart_count
                }
                _ => return,
            }
        };

        if count > policy.max_restarts {
            update_rt(&state, &id, generation, |rt| {
                rt.status = TaskStatus::Failed;
                rt.last_error =
                    Some(format!("连续异常退出已达 {count} 次（上限 {}），停止自动重启", policy.max_restarts));
            });
            emit_one(&state, &id);
            persist(&state);
            return;
        }

        let delay = policy.restart_delay_secs.max(1);
        update_rt(&state, &id, generation, |rt| {
            rt.status = TaskStatus::WaitingRestart;
            rt.next_run_at = Some(now_ms() + delay as i64 * 1000);
        });
        emit_one(&state, &id);
        persist(&state);

        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(delay)) => {}
            _ = stop_rx.recv() => {
                set_status(&state, &id, generation, TaskStatus::Disabled);
                emit_one(&state, &id);
                return;
            }
        }
        // 继续循环 → 重新拉起进程
    }
}

/// 定时任务调度协程：cron / 固定间隔触发一次性运行
async fn schedule(state: SharedState, id: String, generation: u64, mut stop_rx: UnboundedReceiver<()>) {
    loop {
        let Some(cfg) = snapshot_config(&state, &id, generation) else { return };
        if !cfg.enabled {
            set_status(&state, &id, generation, TaskStatus::Disabled);
            emit_one(&state, &id);
            return;
        }

        let next = match compute_next(&cfg.run_mode) {
            Ok(n) => n,
            Err(e) => {
                update_rt(&state, &id, generation, |rt| {
                    rt.status = TaskStatus::Failed;
                    rt.last_error = Some(format!("调度配置无效: {e}"));
                    rt.next_run_at = None;
                });
                emit_one(&state, &id);
                persist(&state);
                return;
            }
        };
        update_rt(&state, &id, generation, |rt| {
            rt.status = TaskStatus::Idle;
            rt.next_run_at = Some(next.timestamp_millis());
        });
        emit_one(&state, &id);

        let dur = (next - Local::now()).to_std().unwrap_or(Duration::from_millis(0));
        tokio::select! {
            _ = tokio::time::sleep(dur) => {}
            _ = stop_rx.recv() => {
                set_status(&state, &id, generation, TaskStatus::Disabled);
                emit_one(&state, &id);
                return;
            }
        }

        let Some(cfg) = snapshot_config(&state, &id, generation) else { return };
        if !cfg.enabled {
            set_status(&state, &id, generation, TaskStatus::Disabled);
            emit_one(&state, &id);
            return;
        }

        update_rt(&state, &id, generation, |rt| {
            rt.status = TaskStatus::Starting;
            rt.last_run_at = Some(now_ms());
        });
        emit_one(&state, &id);

        match spawn_run(&state, &id, &cfg).await {
            Ok(ActiveRun { mut child, tx }) => {
                let pid = child.id();
                update_rt(&state, &id, generation, |rt| {
                    rt.status = TaskStatus::Running;
                    rt.pid = pid;
                    rt.started_at = Some(now_ms());
                });
                emit_one(&state, &id);
                let exit_result = tokio::select! {
                    res = child.wait() => Some(res),
                    _ = stop_rx.recv() => {
                        let _ = child.start_kill();
                        Some(child.wait().await)
                    }
                };
                let stopped = exit_result.is_none();
                match exit_result {
                    Some(Ok(status)) => record_exit(&state, &id, generation, status, &tx),
                    Some(Err(e)) => {
                        let _ = tx.send(LogLine { tag: "sys", text: format!("等待进程退出失败: {e}") });
                    }
                    None => {}
                }
                drop(tx);
                if stopped {
                    // 停止信号触发
                    set_status(&state, &id, generation, TaskStatus::Disabled);
                    emit_one(&state, &id);
                    return;
                }
            }
            Err(e) => {
                update_rt(&state, &id, generation, |rt| {
                    rt.last_error = Some(format!("启动失败: {e}"));
                });
                emit_one(&state, &id);
            }
        }

        update_rt(&state, &id, generation, |rt| {
            rt.status = TaskStatus::Idle;
            rt.last_run_finished_at = Some(now_ms());
            rt.pid = None;
            rt.started_at = None;
        });
        emit_one(&state, &id);
        persist(&state);
    }
}
