use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::config::{AppSettings, RuntimeState, TaskConfig};

/// 持久化文件中的单个任务（配置 + 运行状态快照）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTask {
    pub config: TaskConfig,
    pub runtime: RuntimeState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistFile {
    pub version: u32,
    #[serde(default)]
    pub settings: Option<AppSettings>,
    #[serde(default)]
    pub tasks: Vec<PersistedTask>,
}

pub fn load(data_dir: &Path) -> PersistFile {
    let path = data_dir.join("tasks.json");
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => PersistFile { version: 1, ..Default::default() },
    }
}

/// 原子写入：先写临时文件再 rename，避免写一半损坏
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, bytes)?;
    if std::fs::rename(&tmp, path).is_err() {
        // Windows 上 rename 到已存在文件会失败，先删除再重命名
        let _ = std::fs::remove_file(path);
        std::fs::rename(&tmp, path)?;
    }
    Ok(())
}
