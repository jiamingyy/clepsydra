import { useEffect, useState } from "react";
import { CheckCircle2, Code2, Copy, Database, Moon, Radio, RefreshCw, Sun, XCircle } from "lucide-react";

import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { copyText, notifyError } from "@/lib/notify";
import { PY_REPORT_SNIPPET } from "@/lib/snippets";
import { useTheme } from "@/lib/theme";
import { useStore } from "@/store";
import type { AppSettings, SettingsInfo } from "@/types";

export function Settings() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const i = await api.getSettings();
      setInfo(i);
      setForm(i.settings);
    } catch (e) {
      notifyError(e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings(form);
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    try {
      const token = await api.regenerateToken();
      setForm((f) => (f ? { ...f, token } : f));
      setInfo((i) => (i ? { ...i, settings: { ...i.settings, token } } : i));
    } catch (e) {
      notifyError(e);
    }
  };

  const { tasks } = useStore();
  const [theme, setTheme] = useTheme();

  if (!info || !form) {
    return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  }

  // 与当前生效的设置同步：实际绑定的 URL（未绑定则用已保存端口推导）
  const activeUrl = info.reportUrl ?? `http://127.0.0.1:${info.settings.reportPort}/report`;

  // 预填一个真实任务（优先启用中的）便于直接执行调试；名称含引号时退回 ID 避免破坏 shell 引号
  const sampleTask = tasks.find((t) => t.config.enabled) ?? tasks[0];
  const sampleTaskRef = sampleTask
    ? sampleTask.config.name.includes("'")
      ? sampleTask.config.id
      : sampleTask.config.name
    : "<任务ID或名称>";

  // 单行命令：cmd / PowerShell / bash 均可直接执行
  const curlBody = JSON.stringify({
    task: sampleTaskRef,
    data: { debug: true, message: "来自 curl 手动测试" },
  });
  const curlSnippet = `curl -X POST ${activeUrl} -H "content-type: application/json" -H "x-clepsydra-token: ${info.settings.token}" -d '${curlBody}'`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">上报服务、环境与数据存储</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              {theme === "dark" ? (
                <Moon className="size-4 text-primary" />
              ) : (
                <Sun className="size-4 text-primary" />
              )}{" "}
              外观
            </CardTitle>
            <CardDescription>切换深浅主题，立即生效并自动记忆</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-3.5">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="size-4 text-muted-foreground" />
                ) : (
                  <Sun className="size-4 text-amber-500" />
                )}
                <div>
                  <div className="text-[13px] font-medium">深色模式</div>
                  <div className="text-xs text-muted-foreground">
                    {theme === "dark" ? "当前：夜间主题" : "当前：白天主题"}
                  </div>
                </div>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radio className="size-4 text-primary" /> 上报服务（Dashboard 数据接口）
            </CardTitle>
            <CardDescription>
              任务运行时自动注入 <code className="font-mono text-primary">CLEPSYDRA_*</code> 系列环境变量
              （TASK_ID / TASK_NAME / REPORT_URL / REPORT_PORT / TOKEN），服务仅监听本机回环地址。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid max-w-60 gap-1.5">
              <Label htmlFor="st-port">监听端口（修改后重启应用生效）</Label>
              <Input
                id="st-port"
                type="number"
                min={1024}
                max={65535}
                value={form.reportPort}
                onChange={(e) =>
                  setForm({ ...form, reportPort: Number(e.currentTarget.value) || form.reportPort })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>访问 Token（随任务环境变量下发，用于上报鉴权）</Label>
              <div className="flex gap-2">
                <Input className="flex-1 font-mono text-xs select-all" value={form.token} readOnly />
                <Button variant="outline" size="icon" onClick={() => copyText(form.token)}>
                  <Copy className="size-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={regenerate}>
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                重新生成后需重启任务，运行中的任务仍持有旧 token。
              </p>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">服务状态：</span>
              {info.reportError ? (
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <XCircle className="size-4" /> {info.reportError}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  运行中
                  <span className="font-mono text-xs text-muted-foreground">{activeUrl}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
              {saved && (
                <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
                  已保存
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Code2 className="size-4 text-primary" /> 脚本接入示例
            </CardTitle>
            <CardDescription>在你的 Python 脚本中调用 report 即可上报任意展示数据</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Python</span>
              <Button variant="ghost" size="sm" className="h-6" onClick={() => copyText(PY_REPORT_SNIPPET)}>
                <Copy className="size-3" /> 复制
              </Button>
            </div>
            <pre className="m-0 overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre select-text">
              {PY_REPORT_SNIPPET}
            </pre>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>cURL（已同步当前生效的端口与 token，可直接复制执行）</span>
              <Button variant="ghost" size="sm" className="h-6" onClick={() => copyText(curlSnippet)}>
                <Copy className="size-3" /> 复制
              </Button>
            </div>
            <pre className="m-0 overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre select-text">
              {curlSnippet}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-primary" /> 环境与存储
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="st-uv">uv 可执行文件</Label>
              <Input
                id="st-uv"
                className="font-mono"
                value={form.uvPath}
                onChange={(e) => setForm({ ...form, uvPath: e.currentTarget.value })}
                placeholder="uv"
              />
              <div className="text-xs">
                uv 检测：
                {info.uvVersion ? (
                  <span className="ml-1 text-emerald-600 dark:text-emerald-400">{info.uvVersion}</span>
                ) : (
                  <span className="ml-1 text-red-600 dark:text-red-400">未检测到 uv（请安装或修改路径）</span>
                )}
              </div>
            </div>
            <div className="space-y-1 text-[13px]">
              <div className="text-xs text-muted-foreground">数据目录</div>
              <div className="font-mono break-all select-text">{info.dataDir}</div>
              <div className="mt-3 text-xs text-muted-foreground">任务日志</div>
              <div className="font-mono break-all select-text">
                {info.dataDir}\logs\&lt;任务ID&gt;\task.log（含轮转）
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
