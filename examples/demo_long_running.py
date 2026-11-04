"""Clepsydra 长驻任务示例：打印心跳日志 + 定期上报 Dashboard 数据。

在 Clepsydra 中新建任务：
  运行环境: 普通 Python
  运行模式: 长期运行
  脚本路径: 指向本文件
"""
import json
import os
import socket
import sys
import time
import urllib.request


def report(data: dict) -> None:
    """向 Clepsydra 上报自定义展示数据（Dashboard 卡片实时显示）"""
    url = os.environ.get("CLEPSYDRA_REPORT_URL")
    token = os.environ.get("CLEPSYDRA_TOKEN")
    task = os.environ.get("CLEPSYDRA_TASK_ID")
    if not url or not token or not task:
        print("[demo] 未检测到 Clepsydra 环境变量，跳过上报")
        return
    req = urllib.request.Request(
        url,
        data=json.dumps({"task": task, "data": data}).encode(),
        headers={"content-type": "application/json", "x-clepsydra-token": token},
    )
    urllib.request.urlopen(req, timeout=3)


def find_free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    port = find_free_port()
    print(f"[demo] 服务启动，监听端口 {port}")
    report({"port": port, "状态": "服务正常"})

    i = 0
    while True:
        i += 1
        print(f"[demo] heartbeat {i}")
        if i % 5 == 0:
            report({"port": port, "状态": "服务正常", "心跳次数": i, "内存示例": f"{(i * 1.5) % 100:.1f}MB"})
        if i % 11 == 0:
            print("[demo] 模拟一条错误输出", file=sys.stderr)
        time.sleep(2)
