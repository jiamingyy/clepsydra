import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { ChevronDown, Copy, FolderOpen, Loader2 } from "lucide-react";

import { api } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { copyText, notifyError } from "@/lib/notify";
import { PY_REPORT_SNIPPET } from "@/lib/snippets";
import { cloneTask, newTaskDraft, type TaskConfig } from "@/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[13px] font-semibold text-primary">{title}</div>
      {children}
      <Separator />
    </div>
  );
}

export function TaskForm({
  initial,
  onClose,
  onSaved,
}: {
  /** null = 全新创建；带 id 的配置 = 编辑；不带 id = 按 preset 创建 */
  initial: TaskConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial?.id;
  const [draft, setDraft] = useState<TaskConfig>(() => (initial ? cloneTask(initial) : newTaskDraft()));
  const [argsText, setArgsText] = useState(() => draft.args.join("\n"));
  const [envText, setEnvText] = useState(() =>
    Object.entries(draft.envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  const [cronPreview, setCronPreview] = useState<{ err?: string; next?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.runMode.type !== "cron") {
      setCronPreview(null);
      return;
    }
    const expr = draft.runMode.expr.trim();
    if (!expr) {
      setCronPreview(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .previewCron(expr)
        .then((next) => setCronPreview({ next }))
        .catch((e) => setCronPreview({ err: String(e) }));
    }, 400);
    return () => clearTimeout(t);
  }, [draft.runMode]);

  const set = <K extends keyof TaskConfig>(key: K, value: TaskConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const parseEnv = (text: string): Record<string, string> | string => {
    const out: Record<string, string> = {};
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) return `环境变量格式错误（应为 KEY=VALUE）: "${line}"`;
      const key = line.slice(0, eq).trim();
      if (key in out) return `环境变量重复: "${key}"`;
      out[key] = line.slice(eq + 1);
    }
    return out;
  };

  const num = (v: string, fallback: number, min = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? n : fallback;
  };

  // 脚本路径右侧浏览按钮：普通模式选脚本文件，uv 模式选项目目录（填入工作目录）
  const pickScript = async () => {
    try {
      if (draft.envMode.type === "uv") {
        const dir = await open({ directory: true, title: "选择 uv 项目目录（含 pyproject.toml）" });
        if (typeof dir === "string" && dir) {
          set("workdir", dir);
        }
      } else {
        const file = await open({
          title: "选择 Python 脚本",
          filters: [{ name: "Python 脚本", extensions: ["py"] }],
        });
        if (typeof file === "string" && file) {
          set("scriptPath", file);
        }
      }
    } catch (e) {
      notifyError(e);
    }
  };

  /** 剥离参数首尾成对引号（从命令行复制参数时带上的 shell 引号） */
  const stripPairedQuotes = (s: string): string => {
    if (s.length >= 2) {
      const first = s[0];
      const last = s[s.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return s.slice(1, -1);
      }
    }
    return s;
  };

  const submit = async () => {
    setError(null);
    if (!draft.name.trim()) return setError("请填写任务名称");
    if (!draft.scriptPath.trim()) return setError("请填写脚本路径");

    let envVars: Record<string, string> = {};
    if (envText.trim()) {
      const parsed = parseEnv(envText);
      if (typeof parsed === "string") return setError(parsed);
      envVars = parsed;
    }

    const rawArgs = argsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const args = rawArgs.map(stripPairedQuotes);
    if (rawArgs.some((a, i) => a !== args[i])) {
      toast.info("已自动去除参数首尾的引号（命令行复制习惯），无需手动填写引号");
    }

    const config: TaskConfig = {
      ...draft,
      name: draft.name.trim(),
      scriptPath: draft.scriptPath.trim(),
      workdir: draft.workdir?.trim() || null,
      args,
      envVars,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.updateTask(draft.id, config);
      } else {
        await api.createTask(config);
      }
      onSaved();
    } catch (e) {
      notifyError(e);
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[88vh] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑任务 · ${initial?.name}` : "新建任务"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改后保存，运行中的任务会自动重启生效。" : "创建一个由 Clepsydra 托管的 Python 任务。"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <Section title="运行环境">
            <div className="grid gap-1.5">
              <Label>环境类型</Label>
              <Select
                value={draft.envMode.type}
                onValueChange={(v) =>
                  set(
                    "envMode",
                    v === "uv"
                      ? { type: "uv", noSync: false }
                      : { type: "plain", pythonExecutable: null },
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plain">普通 Python 解释器</SelectItem>
                  <SelectItem value="uv">uv 虚拟环境</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.envMode.type === "plain" && (
              <div className="grid gap-1.5">
                <Label htmlFor="tf-python">Python 可执行文件</Label>
                <Input
                  id="tf-python"
                  className="font-mono"
                  value={draft.envMode.pythonExecutable ?? ""}
                  onChange={(e) =>
                    set("envMode", { type: "plain", pythonExecutable: e.currentTarget.value || null })
                  }
                  placeholder="留空使用 PATH 中的 python，可填绝对路径"
                />
                <p className="text-xs text-muted-foreground">
                  Windows 下若命中 Microsoft Store 占位符，请填写完整路径。
                </p>
              </div>
            )}
            {draft.envMode.type === "uv" && (
              <div className="space-y-2">
                <Label className="flex flex-row items-center gap-3 font-normal">
                  <Switch
                    checked={draft.envMode.noSync}
                    onCheckedChange={(v) => set("envMode", { type: "uv", noSync: v })}
                  />
                  跳过依赖同步（--no-sync，要求 .venv 已就绪，启动更快）
                </Label>
                <p className="text-xs text-muted-foreground">
                  通过 <code className="font-mono text-primary">uv run --directory &lt;工作目录&gt;</code>{" "}
                  执行，自动使用/同步项目环境。
                </p>
              </div>
            )}
          </Section>

          <Section title="基本信息">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="tf-name">任务名称 *</Label>
                <Input
                  id="tf-name"
                  value={draft.name}
                  onChange={(e) => set("name", e.currentTarget.value)}
                  placeholder="例如：数据同步服务"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tf-script">
                  脚本路径 *
                  {draft.envMode.type === "uv" && (
                    <span className="font-normal text-muted-foreground">（相对项目目录）</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="tf-script"
                    className="font-mono"
                    value={draft.scriptPath}
                    onChange={(e) => set("scriptPath", e.currentTarget.value)}
                    placeholder={
                      draft.envMode.type === "uv" ? "main.py 或 scripts/run.py" : "C:\\scripts\\main.py"
                    }
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={pickScript}
                    title={draft.envMode.type === "uv" ? "选择 uv 项目目录" : "选择脚本文件"}
                  >
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tf-workdir">工作目录</Label>
              <Input
                id="tf-workdir"
                className="font-mono"
                value={draft.workdir ?? ""}
                onChange={(e) => set("workdir", e.currentTarget.value)}
                placeholder="留空：普通模式用当前目录，uv 用脚本所在目录"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="tf-args">启动参数（每行一个，含空格的参数整行填入，无需加引号）</Label>
                <Textarea
                  id="tf-args"
                  className="font-mono text-xs"
                  rows={3}
                  value={argsText}
                  onChange={(e) => setArgsText(e.currentTarget.value)}
                  placeholder={"--port\n8000"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tf-env">环境变量（每行 KEY=VALUE）</Label>
                <Textarea
                  id="tf-env"
                  className="font-mono text-xs"
                  rows={3}
                  value={envText}
                  onChange={(e) => setEnvText(e.currentTarget.value)}
                  placeholder={"API_KEY=xxx\nDEBUG=1"}
                />
              </div>
            </div>
          </Section>

          <Section title="运行模式">
            <div className="grid gap-1.5">
              <Label>模式</Label>
              <Select
                value={draft.runMode.type}
                onValueChange={(v) =>
                  set(
                    "runMode",
                    v === "cron"
                      ? { type: "cron", expr: draft.runMode.type === "cron" ? draft.runMode.expr : "*/5 * * * *" }
                      : v === "interval"
                        ? { type: "interval", secs: draft.runMode.type === "interval" ? draft.runMode.secs : 60 }
                        : { type: "long_running" },
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long_running">长期运行（常驻守护）</SelectItem>
                  <SelectItem value="cron">Cron 定时</SelectItem>
                  <SelectItem value="interval">固定间隔</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.runMode.type === "cron" && (
              <div className="grid gap-1.5">
                <Label htmlFor="tf-cron">Cron 表达式（分 时 日 月 周）</Label>
                <Input
                  id="tf-cron"
                  className="font-mono"
                  value={draft.runMode.expr}
                  onChange={(e) => set("runMode", { type: "cron", expr: e.currentTarget.value })}
                  placeholder="*/5 * * * *"
                />
                {cronPreview?.err && <p className="text-xs text-red-400">{cronPreview.err}</p>}
                {cronPreview?.next && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                    接下来 5 次运行：
                    {cronPreview.next.map((t) => (
                      <div key={t}>{t}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {draft.runMode.type === "interval" && (
              <div className="grid max-w-60 gap-1.5">
                <Label htmlFor="tf-interval">运行间隔（秒）</Label>
                <Input
                  id="tf-interval"
                  type="number"
                  min={1}
                  value={draft.runMode.secs}
                  onChange={(e) =>
                    set("runMode", { type: "interval", secs: Math.max(1, num(e.currentTarget.value, 60, 1)) })
                  }
                />
              </div>
            )}
          </Section>

          <Section title="异常自动重启（长期运行模式）">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tf-maxr">重启次数上限</Label>
                <Input
                  id="tf-maxr"
                  type="number"
                  min={0}
                  value={draft.restartPolicy.maxRestarts}
                  onChange={(e) =>
                    set("restartPolicy", {
                      ...draft.restartPolicy,
                      maxRestarts: num(e.currentTarget.value, 3),
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tf-delay">重启间隔（秒）</Label>
                <Input
                  id="tf-delay"
                  type="number"
                  min={1}
                  value={draft.restartPolicy.restartDelaySecs}
                  onChange={(e) =>
                    set("restartPolicy", {
                      ...draft.restartPolicy,
                      restartDelaySecs: Math.max(1, num(e.currentTarget.value, 5, 1)),
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tf-window">计数重置窗口（秒）</Label>
                <Input
                  id="tf-window"
                  type="number"
                  min={0}
                  value={draft.restartPolicy.resetWindowSecs}
                  onChange={(e) =>
                    set("restartPolicy", {
                      ...draft.restartPolicy,
                      resetWindowSecs: num(e.currentTarget.value, 300),
                    })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              进程存活超过「重置窗口」后重启计数清零；连续异常退出超过上限则停止自动重启并标记为失败。
            </p>
          </Section>

          <Section title="日志">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tf-logmb">单文件大小上限（MB）</Label>
                <Input
                  id="tf-logmb"
                  type="number"
                  min={1}
                  value={draft.logConfig.maxFileMb}
                  onChange={(e) =>
                    set("logConfig", {
                      ...draft.logConfig,
                      maxFileMb: Math.max(1, num(e.currentTarget.value, 5, 1)),
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tf-logn">保留文件数</Label>
                <Input
                  id="tf-logn"
                  type="number"
                  min={1}
                  value={draft.logConfig.maxFiles}
                  onChange={(e) =>
                    set("logConfig", {
                      ...draft.logConfig,
                      maxFiles: Math.max(1, num(e.currentTarget.value, 3, 1)),
                    })
                  }
                />
              </div>
            </div>
          </Section>

          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center gap-2 py-1 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground">
              <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              如何在脚本中上报自定义数据（Dashboard）？
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  任务运行时会自动注入{" "}
                  <code className="font-mono text-primary">CLEPSYDRA_TASK_ID / REPORT_URL / REPORT_PORT / TOKEN</code>{" "}
                  环境变量，复制下方函数到你的脚本即可：
                </p>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2 h-6"
                    onClick={() => copyText(PY_REPORT_SNIPPET)}
                  >
                    <Copy className="size-3" /> 复制
                  </Button>
                  <pre className="m-0 overflow-x-auto rounded-lg border bg-muted/50 p-3 pr-24 font-mono text-[11.5px] leading-relaxed whitespace-pre select-text">
                    {PY_REPORT_SNIPPET}
                  </pre>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Label className="flex flex-row items-center gap-3 font-normal">
            <Switch checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
            {isEdit ? "保存后立即启动任务" : "创建后立即启动任务"}
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "保存中…" : isEdit ? "保存修改" : "创建任务"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
