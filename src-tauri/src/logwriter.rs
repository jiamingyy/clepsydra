use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::mpsc::UnboundedReceiver;

use tauri::Emitter;

/// 一行日志：tag 标记来源（out / err / sys）
pub struct LogLine {
    pub tag: &'static str,
    pub text: String,
}

/// 按大小轮转的单任务日志写入器
pub struct LogWriter {
    path: PathBuf,
    file: Option<File>,
    size: u64,
    max_bytes: u64,
    max_files: u32,
}

impl LogWriter {
    pub fn open(dir: &Path, max_file_mb: u64, max_files: u32) -> std::io::Result<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join("task.log");
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata().map(|m| m.len()).unwrap_or(0);
        Ok(Self {
            path,
            file: Some(file),
            size,
            max_bytes: max_file_mb.max(1) * 1024 * 1024,
            max_files: max_files.clamp(1, 50),
        })
    }

    pub fn write_line(&mut self, line: &str) -> std::io::Result<()> {
        let len = line.len() as u64 + 1;
        if self.size > 0 && self.size + len > self.max_bytes {
            if let Err(e) = self.rotate() {
                eprintln!("[clepsydra] 日志轮转失败: {e}");
            }
        }
        let file = self
            .file
            .as_mut()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "log file closed"))?;
        file.write_all(line.as_bytes())?;
        file.write_all(b"\n")?;
        self.size += len;
        Ok(())
    }

    fn rotate(&mut self) -> std::io::Result<()> {
        self.file = None; // 关闭当前文件
        let n = self.max_files;
        let oldest = rotated_path(&self.path, n);
        let _ = fs::remove_file(&oldest);
        for i in (1..n).rev() {
            let _ = fs::rename(rotated_path(&self.path, i), rotated_path(&self.path, i + 1));
        }
        let _ = fs::rename(&self.path, rotated_path(&self.path, 1));
        let file = OpenOptions::new().create(true).append(true).open(&self.path)?;
        self.size = 0;
        self.file = Some(file);
        Ok(())
    }
}

fn rotated_path(base: &Path, index: u32) -> PathBuf {
    base.with_extension(format!("log.{index}"))
}

/// 环形缓冲容量（内存中保留的最近行数）
pub const RING_CAPACITY: usize = 2000;

pub fn push_buf(buf: &Arc<Mutex<VecDeque<String>>>, line: String) {
    let mut b = buf.lock().unwrap();
    if b.len() >= RING_CAPACITY {
        b.pop_front();
    }
    b.push_back(line);
}

/// 日志泵：消费进程输出，写文件、写环形缓冲，并按批（40 行 / 200ms）推送给前端
pub async fn log_pump(
    app: tauri::AppHandle,
    task_id: String,
    buf: Arc<Mutex<VecDeque<String>>>,
    mut rx: UnboundedReceiver<LogLine>,
    mut writer: LogWriter,
) {
    let mut pending: Vec<String> = Vec::new();
    let mut deadline: Option<tokio::time::Instant> = None;

    let flush = |pending: &mut Vec<String>, deadline: &mut Option<tokio::time::Instant>| {
        if pending.is_empty() {
            return;
        }
        let _ = app.emit(
            "clepsydra://log",
            serde_json::json!({ "taskId": task_id, "lines": pending }),
        );
        pending.clear();
        *deadline = None;
    };

    loop {
        tokio::select! {
            item = rx.recv() => {
                match item {
                    Some(l) => {
                        let line = format!(
                            "{} [{}] {}",
                            chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                            l.tag,
                            l.text
                        );
                        if let Err(e) = writer.write_line(&line) {
                            eprintln!("[clepsydra] 日志写入失败: {e}");
                        }
                        push_buf(&buf, line.clone());
                        pending.push(line);
                        if deadline.is_none() {
                            deadline = Some(tokio::time::Instant::now() + Duration::from_millis(200));
                        }
                        if pending.len() >= 40 {
                            flush(&mut pending, &mut deadline);
                        }
                    }
                    None => {
                        flush(&mut pending, &mut deadline);
                        break;
                    }
                }
            }
            _ = async {
                match deadline {
                    Some(d) => tokio::time::sleep_until(d).await,
                    None => std::future::pending::<()>().await,
                }
            } => {
                flush(&mut pending, &mut deadline);
            }
        }
    }
}

/// 按行读取子进程输出（容忍非 UTF-8 字节），送入日志通道
pub async fn read_stream<R: AsyncRead + Unpin>(stream: R, tag: &'static str, tx: tokio::sync::mpsc::UnboundedSender<LogLine>) {
    let mut reader = BufReader::new(stream);
    let mut buf: Vec<u8> = Vec::with_capacity(512);
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) => break,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n') | Some(b'\r')) {
                    buf.pop();
                }
                let text = String::from_utf8_lossy(&buf).to_string();
                if tx.send(LogLine { tag, text }).is_err() {
                    break;
                }
            }
            Err(e) => {
                let _ = tx.send(LogLine { tag: "sys", text: format!("读取进程输出失败: {e}") });
                break;
            }
        }
    }
}
