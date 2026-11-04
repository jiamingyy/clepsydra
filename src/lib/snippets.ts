/** 任务脚本上报自定义数据的 Python 示例（设置页 / 新建任务表单共用） */
export const PY_REPORT_SNIPPET = `import json, os, urllib.request

# Clepsydra 启动任务时自动注入的环境变量：
#   CLEPSYDRA_TASK_ID      本任务 ID（上报标识，也可用任务名）
#   CLEPSYDRA_TASK_NAME    本任务名称
#   CLEPSYDRA_REPORT_URL   上报地址（含端口）
#   CLEPSYDRA_REPORT_PORT  上报服务端口，如 17321
#   CLEPSYDRA_TOKEN        鉴权 token
def report(**data):
    """向 Clepsydra 上报自定义展示数据（Dashboard 卡片实时显示）"""
    url = os.environ.get("CLEPSYDRA_REPORT_URL")
    token = os.environ.get("CLEPSYDRA_TOKEN")
    task = os.environ.get("CLEPSYDRA_TASK_ID")
    if not url or not token or not task:
        print("[clepsydra] 未检测到注入的环境变量，跳过上报")
        return
    req = urllib.request.Request(
        url,
        data=json.dumps({"task": task, "data": data}).encode(),
        headers={
            "content-type": "application/json",
            "x-clepsydra-token": token,
        },
    )
    urllib.request.urlopen(req, timeout=3)

port = os.environ.get("CLEPSYDRA_REPORT_PORT", "?")
report(port=port, status="服务正常", qps=123.4)`;
