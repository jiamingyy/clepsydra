mod config;
mod logwriter;
mod persist;
mod reporter;
mod state;
mod supervisor;

use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager, RunEvent};
use tokio::process::Command;

use crate::config::{AppSettings, TaskConfig, TaskWithState};
use crate::state::{emit_one, now_ms, persist, SharedState, TaskEntry};
use crate::supervisor::{parse_cron, deactivate};

#[tauri::command]
fn list_tasks(state: tauri::State<'_, SharedState>) -> Vec<TaskWithState> {
    state.inner().snapshot_tasks()
}

fn validate_config(config: &TaskConfig) -> Result<(), String> {
    if config.name.trim().is_empty() {
        return Err("任务名称不能为空".into());
    }
    if config.script_path.trim().is_empty() {
        return Err("脚本路径不能为空".into());
    }
    match &config.run_mode {
        config::RunMode::Cron { expr } => {
            parse_cron(expr)?;
        }
        config::RunMode::Interval { secs } => {
            if *secs == 0 {
                return Err("运行间隔必须大于 0 秒".into());
            }
        }
        _ => {}
    }
    if let config::EnvMode::Uv { .. } = &config.env_mode {
        // uv 模式无额外必填项（工作目录缺省取脚本所在目录）
    }
    Ok(())
}

#[tauri::command]
async fn create_task(
    state: tauri::State<'_, SharedState>,
    mut config: TaskConfig,
) -> Result<TaskWithState, String> {
    validate_config(&config)?;
    let s = state.inner().clone();
    config.id = uuid::Uuid::new_v4().to_string();
    config.created_at = now_ms();
    let id = config.id.clone();
    let enabled = config.enabled;
    let entry = TaskEntry::new(config);
    {
        let mut inner = s.inner.write().unwrap();
        inner.tasks.insert(id.clone(), entry);
    }
    if enabled {
        supervisor::activate(&s, &id)?;
    }
    persist(&s);
    emit_one(&s, &id);
    s.task_snapshot(&id).ok_or_else(|| "内部错误".to_string())
}

#[tauri::command]
async fn update_task(
    state: tauri::State<'_, SharedState>,
    id: String,
    mut config: TaskConfig,
) -> Result<TaskWithState, String> {
    validate_config(&config)?;
    let s = state.inner().clone();
    deactivate(&s, &id);
    {
        let mut inner = s.inner.write().unwrap();
        let e = inner.tasks.get_mut(&id).ok_or_else(|| "任务不存在".to_string())?;
        config.id = id.clone();
        config.created_at = e.config.created_at;
        e.config = config.clone();
    }
    if config.enabled {
        supervisor::activate(&s, &id)?;
    }
    persist(&s);
    emit_one(&s, &id);
    s.task_snapshot(&id).ok_or_else(|| "任务不存在".to_string())
}

#[tauri::command]
async fn delete_task(
    state: tauri::State<'_, SharedState>,
    id: String,
    remove_logs: bool,
) -> Result<(), String> {
    let s = state.inner().clone();
    deactivate(&s, &id);
    {
        let mut inner = s.inner.write().unwrap();
        inner.tasks.remove(&id);
    }
    if remove_logs {
        let dir = s.data_dir.join("logs").join(&id);
        let _ = std::fs::remove_dir_all(dir);
    }
    persist(&s);
    let _ = s.app.emit("clepsydra://deleted", serde_json::json!({ "id": id }));
    Ok(())
}

#[tauri::command]
async fn start_task(state: tauri::State<'_, SharedState>, id: String) -> Result<(), String> {
    let s = state.inner().clone();
    {
        let mut inner = s.inner.write().unwrap();
        let e = inner.tasks.get_mut(&id).ok_or_else(|| "任务不存在".to_string())?;
        e.config.enabled = true;
    }
    supervisor::activate(&s, &id)?;
    persist(&s);
    emit_one(&s, &id);
    Ok(())
}

#[tauri::command]
async fn stop_task(state: tauri::State<'_, SharedState>, id: String) -> Result<(), String> {
    let s = state.inner().clone();
    {
        let mut inner = s.inner.write().unwrap();
        if let Some(e) = inner.tasks.get_mut(&id) {
            e.config.enabled = false;
        } else {
            return Err("任务不存在".into());
        }
    }
    deactivate(&s, &id);
    persist(&s);
    emit_one(&s, &id);
    Ok(())
}

#[tauri::command]
async fn restart_task(state: tauri::State<'_, SharedState>, id: String) -> Result<(), String> {
    let s = state.inner().clone();
    {
        let mut inner = s.inner.write().unwrap();
        let e = inner.tasks.get_mut(&id).ok_or_else(|| "任务不存在".to_string())?;
        e.config.enabled = true;
    }
    deactivate(&s, &id);
    supervisor::activate(&s, &id)?;
    persist(&s);
    emit_one(&s, &id);
    Ok(())
}

#[tauri::command]
fn get_log_history(
    state: tauri::State<'_, SharedState>,
    id: String,
    max_lines: usize,
) -> Vec<String> {
    let inner = state.inner.read().unwrap();
    match inner.tasks.get(&id) {
        Some(e) => {
            let buf = e.log_buf.lock().unwrap();
            let skip = buf.len().saturating_sub(max_lines.max(1));
            buf.iter().skip(skip).cloned().collect()
        }
        None => vec![],
    }
}

#[tauri::command]
async fn clear_dashboard(state: tauri::State<'_, SharedState>, id: String) -> Result<(), String> {
    let s = state.inner().clone();
    {
        let mut inner = s.inner.write().unwrap();
        let e = inner.tasks.get_mut(&id).ok_or_else(|| "任务不存在".to_string())?;
        e.rt.dashboard = None;
        e.rt.dashboard_at = None;
    }
    persist(&s);
    emit_one(&s, &id);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInfo {
    settings: AppSettings,
    data_dir: String,
    report_url: Option<String>,
    report_error: Option<String>,
    uv_version: Option<String>,
}

async fn detect_uv(uv_path: &str) -> Option<String> {
    let mut cmd = Command::new(uv_path);
    cmd.arg("--version");
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    match tokio::time::timeout(Duration::from_secs(3), cmd.output()).await {
        Ok(Ok(out)) if out.status.success() => {
            Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
        }
        _ => None,
    }
}

#[tauri::command]
async fn get_settings(state: tauri::State<'_, SharedState>) -> Result<SettingsInfo, String> {
    let s = state.inner().clone();
    let (settings, report_url, report_error) = {
        let inner = s.inner.read().unwrap();
        (inner.settings.clone(), inner.report_url.clone(), inner.report_error.clone())
    };
    let uv_version = detect_uv(&settings.uv_path).await;
    Ok(SettingsInfo {
        settings,
        data_dir: s.data_dir.display().to_string(),
        report_url,
        report_error,
        uv_version,
    })
}

#[tauri::command]
async fn update_settings(
    state: tauri::State<'_, SharedState>,
    mut settings: AppSettings,
) -> Result<(), String> {
    let s = state.inner().clone();
    if !(1024..=65535).contains(&settings.report_port) {
        return Err("端口应在 1024~65535 之间".into());
    }
    {
        let mut inner = s.inner.write().unwrap();
        if settings.token.trim().is_empty() {
            settings.token = inner.settings.token.clone();
        }
        let port_changed = settings.report_port != inner.settings.report_port;
        inner.settings = settings;
        if port_changed {
            inner.report_error =
                Some("端口已修改，重启应用后生效".to_string());
        }
    }
    persist(&s);
    Ok(())
}

#[tauri::command]
async fn regenerate_token(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let s = state.inner().clone();
    let token = uuid::Uuid::new_v4().simple().to_string();
    {
        let mut inner = s.inner.write().unwrap();
        inner.settings.token = token.clone();
    }
    persist(&s);
    Ok(token)
}

#[tauri::command]
fn preview_cron(expr: String) -> Result<Vec<String>, String> {
    let sched = parse_cron(&expr)?;
    Ok(sched
        .after(&chrono::Local::now())
        .take(5)
        .map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string())
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = handle.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let state = state::init(handle.clone(), data_dir);

            // 恢复开机自启任务
            let recover: Vec<String> = {
                let inner = state.inner.read().unwrap();
                inner
                    .tasks
                    .values()
                    .filter(|e| e.config.enabled)
                    .map(|e| e.config.id.clone())
                    .collect()
            };
            app.manage(state.clone());
            for id in recover {
                let _ = supervisor::activate(&state, &id);
            }

            // 启动本地上报 HTTP 服务
            tauri::async_runtime::spawn(reporter::start_server(state.clone()));

            // 自定义标题栏 + 系统托盘（仅桌面端）
            #[cfg(desktop)]
            setup_desktop(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_tasks,
            create_task,
            update_task,
            delete_task,
            start_task,
            stop_task,
            restart_task,
            get_log_history,
            clear_dashboard,
            get_settings,
            update_settings,
            regenerate_token,
            preview_cron
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SharedState>() {
                    state::shutdown_all(&state);
                }
            }
        });
}

/// 显示并聚焦主窗口（若最小化则先还原）
#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 自定义标题栏与系统托盘：
/// - Windows/Linux 移除原生装饰改用前端自绘标题栏；macOS 使用 hiddenInset 保留红绿灯
/// - 点击窗口关闭按钮时隐藏到托盘，托盘菜单提供「显示主窗口 / 退出」
#[cfg(desktop)]
fn setup_desktop(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    if let Some(win) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        let _ = win.set_title_bar_style(tauri::TitleBarStyle::HiddenInset);
        #[cfg(not(target_os = "macos"))]
        let _ = win.set_decorations(false);

        // 关闭 → 隐藏到托盘（配合托盘菜单退出）
        let w = win.clone();
        win.on_window_event(move |e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
            }
        });
    }

    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Clepsydra", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("clepsydra-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Clepsydra · Python 任务管理")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 左键双击 / 左键单击 → 显示主窗口
            match event {
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } => show_main_window(tray.app_handle()),
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => show_main_window(tray.app_handle()),
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
