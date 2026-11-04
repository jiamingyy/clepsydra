use axum::extract::{State as AxumState, Json};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;

use crate::state::{emit_one, now_ms, persist, SharedState};

#[derive(Clone)]
struct WebState {
    core: SharedState,
}

#[derive(Deserialize)]
struct ReportBody {
    /// 任务 ID 或任务名称
    task: String,
    /// 任意 JSON 展示数据
    data: serde_json::Value,
}

/// 启动本地上报 HTTP 服务（仅监听 127.0.0.1，token 鉴权）
pub async fn start_server(state: SharedState) {
    let port = state.inner.read().unwrap().settings.report_port;
    let ws = WebState { core: state.clone() };
    let router = Router::new()
        .route("/report", post(report))
        .route("/tasks", get(list_tasks))
        .route("/health", get(|| async { "ok" }))
        .with_state(ws);

    match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => {
            let url = format!("http://127.0.0.1:{port}/report");
            {
                let mut inner = state.inner.write().unwrap();
                inner.report_url = Some(url);
                inner.report_error = None;
            }
            let _ = axum::serve(listener, router).await;
        }
        Err(e) => {
            let mut inner = state.inner.write().unwrap();
            // 绑定失败则清空 URL：避免把不可用（甚至指向他人进程）的地址注入任务环境变量
            inner.report_url = None;
            inner.report_error = Some(format!("端口 {port} 绑定失败: {e}"));
        }
    }
}

async fn report(
    AxumState(ws): AxumState<WebState>,
    headers: HeaderMap,
    Json(body): Json<ReportBody>,
) -> StatusCode {
    let token = ws.core.inner.read().unwrap().settings.token.clone();
    let got = headers
        .get("x-clepsydra-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if got != token {
        return StatusCode::UNAUTHORIZED;
    }

    let target = {
        let inner = ws.core.inner.read().unwrap();
        inner
            .tasks
            .values()
            .find(|e| e.config.id == body.task || e.config.name == body.task)
            .map(|e| e.config.id.clone())
    };
    let Some(task_id) = target else {
        return StatusCode::NOT_FOUND;
    };

    let now = now_ms();
    {
        let mut inner = ws.core.inner.write().unwrap();
        match inner.tasks.get_mut(&task_id) {
            Some(e) => {
                e.rt.dashboard = Some(body.data);
                e.rt.dashboard_at = Some(now);
            }
            None => return StatusCode::NOT_FOUND,
        }
    }
    emit_one(&ws.core, &task_id);
    persist(&ws.core);
    StatusCode::OK
}

async fn list_tasks(AxumState(ws): AxumState<WebState>) -> Json<serde_json::Value> {
    let inner = ws.core.inner.read().unwrap();
    let tasks: Vec<serde_json::Value> = inner
        .tasks
        .values()
        .map(|e| {
            serde_json::json!({
                "id": e.config.id,
                "name": e.config.name,
                "status": e.rt.status,
            })
        })
        .collect();
    Json(serde_json::json!({ "tasks": tasks }))
}
