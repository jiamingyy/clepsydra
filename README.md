# Clepsydra

跨平台桌面客户端，用于运行和管理自己编写的 Python 小脚本。基于 Tauri 2 + React + Tailwind CSS + shadcn/ui 构建，进程管理、调度、日志与持久化全部在 Rust 后端完成。

## 功能

- **任务管理**：普通 Python 脚本 / uv 虚拟环境（`uv run`，可选 `--no-sync`）
- **运行模式**：长期运行（守护式）、Cron 定时、固定间隔；侧边栏「运行任务」二级菜单分别管理常驻与定时任务，侧边栏可收起为图标导轨
- **进程守护**：异常退出自动重启，可配置次数上限、重启间隔、计数重置窗口
- **日志**：每任务独立落盘 + 按大小轮转，客户端实时查看（stdout/stderr/系统事件）
- **持久化**：任务配置与运行状态存储于应用数据目录，程序重启后自动恢复启用中的任务
- **Dashboard 上报**：任务脚本通过本机 HTTP 接口上报自定义展示内容（端口、状态等），实时聚合展示
- **自定义标题栏**：跟随主题风格；Windows/Linux 自绘窗口控制按钮（按平台样式适配），macOS 保留系统红绿灯
- **深浅双主题**：设置页一键切换白天/夜间皮肤，自动记忆
- **系统托盘**：关闭主窗口时隐藏到托盘继续运行；左键点击托盘显示窗口，右键菜单提供「显示主窗口 / 退出 Clepsydra」

## 开发

```bash
pnpm install
pnpm tauri dev    # 开发调试
pnpm tauri build  # 打包
```

## 任务运行时注入的环境变量

| 变量 | 说明 |
| --- | --- |
| `CLEPSYDRA_TASK_ID` | 任务 ID（上报时标识自己） |
| `CLEPSYDRA_TASK_NAME` | 任务名称 |
| `CLEPSYDRA_REPORT_URL` | 上报地址，如 `http://127.0.0.1:17321/report` |
| `CLEPSYDRA_REPORT_PORT` | 上报服务端口，如 `17321` |
| `CLEPSYDRA_TOKEN` | 上报鉴权 token（请求头 `x-clepsydra-token`） |

### 上报示例（Python）

```python
import json, os, urllib.request

def report(**data):
    req = urllib.request.Request(
        os.environ["CLEPSYDRA_REPORT_URL"],
        data=json.dumps({"task": os.environ["CLEPSYDRA_TASK_ID"], "data": data}).encode(),
        headers={"content-type": "application/json",
                 "x-clepsydra-token": os.environ["CLEPSYDRA_TOKEN"]})
    urllib.request.urlopen(req)

report(port=8000, status="服务正常", qps=123.4)
```

完整示例见 `examples/`：`demo_long_running.py`（长驻 + 上报）、`demo_scheduled.py`（定时一次性）。

## 说明

- **Cron 格式**：标准 5 字段（分 时 日 月 周），也支持 6/7 字段（首位为秒）。表单中可实时预览接下来 5 次运行时间。
- **重启策略**：进程存活超过「重置窗口」秒后重启计数清零；连续异常退出超过上限则标记失败并停止自动重启，可手动再次启动。
- **uv 任务**：通过 `uv run --directory <工作目录> <脚本>` 执行；工作目录留空时默认取脚本所在目录。可在设置页配置 uv 路径并检测安装。
- **数据位置**：任务配置与状态在 `<应用数据目录>/tasks.json`，日志在 `<应用数据目录>/logs/<任务ID>/task.log`（轮转文件为 `task.log.1`、`task.log.2` …）。
- **上报服务**：仅监听 `127.0.0.1`，端口与 token 可在设置页修改（端口修改需重启应用）。

## 发布

推送 `v*` 标签到 GitHub 后，Actions 会自动在 Windows / macOS（Intel + Apple Silicon）/ Linux 上构建，并将安装包（msi/nsis、dmg、deb/rpm/AppImage）发布到 GitHub Releases：

1. 更新 `src-tauri/tauri.conf.json` 中的 `version` 并提交
2. 打 tag 并推送（**标签必须与版本号一致**，否则构建会校验失败）：

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. 在仓库的 Actions 页查看构建进度，完成后在 Releases 页下载各平台安装包

也可在 Actions 页面通过 **Run workflow** 手动触发（未指定 tag 时自动使用 `tauri.conf.json` 里的版本号）。版本号不变时重复发布会更新同名 Release 的产物。
