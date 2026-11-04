import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Eraser,
  History,
  Infinity as InfinityIcon,
  Loader2,
  Package,
  Pencil,
  Play,
  RotateCw,
  ScrollText,
  Square,
  Terminal,
} from "lucide-react";

import { api } from "@/api";
import { DashboardData } from "@/components/DashboardData";
import { LogViewer } from "@/components/LogViewer";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTaskActions } from "@/hooks/use-task-actions";
import { countdown, fmtDuration, fmtTime } from "@/lib/format";
import { isActiveStatus, type TaskConfig } from "@/types";
import { useStore } from "@/store";

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-border/50 py-2 text-[13px] last:border-0">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all select-text">{children}</span>
    </div>
  );
}

export function TaskDetail({
  id,
  onBack,
  onEditTask,
}: {
  id: string;
  onBack: () => void;
  onEditTask: (config: TaskConfig) => void;
}) {
  const { byId, now } = useStore();
  const { act, busy } = useTaskActions();
  const task = byId(id);
  const [tab, setTab] = useState("overview");

  if (!task) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> 返回
        </Button>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center text-sm text-muted-foreground">
          任务不存在或已删除
        </div>
      </div>
    );
  }

  const { config: c, state: s } = task;
  const isBusy = busy(c.id);
  const active = isActiveStatus(s.status);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6 pb-12">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="flex items-center gap-3 text-xl font-semibold">
              {c.name}
              <StatusBadge status={s.status} />
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">{c.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!active ? (
            <Button size="sm" disabled={isBusy} onClick={() => act(c.id, api.startTask)}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              启动
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => act(c.id, api.stopTask)}>
                <Square className="size-4" /> 停止
              </Button>
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => act(c.id, api.restartTask)}>
                <RotateCw className="size-4" /> 重启
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => onEditTask(c)}>
            <Pencil className="size-4" /> 编辑
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="size-3.5" /> 日志
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card className="gap-2">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">运行状态</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-2">
                <KV label="进程 PID">
                  <span className="font-mono">{s.pid ?? "—"}</span>
                </KV>
                <KV label="运行时长">
                  <span className="font-mono">
                    {s.status === "running" && s.startedAt != null
                      ? fmtDuration(now - s.startedAt)
                      : "—"}
                  </span>
                </KV>
                <KV label="重启计数">{s.restartCount} 次</KV>
                {s.nextRunAt != null && (
                  <KV label="下次运行">
                    {countdown(s.nextRunAt - now)}{" "}
                    <span className="text-muted-foreground">({fmtTime(s.nextRunAt)})</span>
                  </KV>
                )}
                {s.lastRunAt != null && (
                  <KV label="上次触发">{fmtTime(s.lastRunAt)}</KV>
                )}
                {s.lastExit && (
                  <KV label="上次退出">
                    {s.lastExit.success ? (
                      <span className="text-emerald-600 dark:text-emerald-400">成功</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">失败 code={s.lastExit.code ?? "—"}</span>
                    )}{" "}
                    <span className="text-muted-foreground">{fmtTime(s.lastExit.time)}</span>
                  </KV>
                )}
                {s.lastError && (
                  <KV label="最近错误">
                    <span className="break-all text-red-600 dark:text-red-400">{s.lastError}</span>
                  </KV>
                )}
              </CardContent>
            </Card>

            <Card className="gap-2">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">任务配置</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-2">
                <KV label="运行环境">
                  <span className="flex items-center gap-1.5">
                    {c.envMode.type === "uv" ? (
                      <>
                        <Package className="size-3.5 text-muted-foreground" />
                        uv 环境{c.envMode.noSync ? "（--no-sync）" : ""}
                      </>
                    ) : (
                      <>
                        <Terminal className="size-3.5 text-muted-foreground" />
                        Python: {c.envMode.pythonExecutable || "python（PATH）"}
                      </>
                    )}
                  </span>
                </KV>
                <KV label="运行模式">
                  <span className="flex items-center gap-1.5">
                    {c.runMode.type === "cron" ? (
                      <>
                        <CalendarClock className="size-3.5 text-muted-foreground" />
                        Cron: <span className="font-mono">{c.runMode.expr}</span>
                      </>
                    ) : c.runMode.type === "interval" ? (
                      <>
                        <Clock className="size-3.5 text-muted-foreground" />
                        每 {c.runMode.secs} 秒
                      </>
                    ) : (
                      <>
                        <InfinityIcon className="size-3.5 text-muted-foreground" />
                        长期运行（常驻）
                      </>
                    )}
                  </span>
                </KV>
                <KV label="脚本路径">
                  <span className="font-mono">{c.scriptPath}</span>
                </KV>
                <KV label="工作目录">
                  <span className="font-mono">{c.workdir ?? "（默认）"}</span>
                </KV>
                {c.args.length > 0 && (
                  <KV label="启动参数">
                    <span className="font-mono">{c.args.join(" ")}</span>
                  </KV>
                )}
                {Object.keys(c.envVars).length > 0 && (
                  <KV label="环境变量">
                    <span className="font-mono">
                      {Object.entries(c.envVars).map(([k, v]) => (
                        <div key={k}>
                          {k}={v}
                        </div>
                      ))}
                    </span>
                  </KV>
                )}
                <KV label="重启策略">
                  上限 {c.restartPolicy.maxRestarts} 次 · 间隔{" "}
                  {c.restartPolicy.restartDelaySecs}s · 窗口 {c.restartPolicy.resetWindowSecs}s
                </KV>
                <KV label="日志轮转">
                  {c.logConfig.maxFileMb}MB × {c.logConfig.maxFiles} 个
                </KV>
                <KV label="创建时间">{fmtTime(c.createdAt)}</KV>
              </CardContent>
            </Card>

            <Card className="gap-2 lg:col-span-2">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="size-4 text-muted-foreground" /> 上报数据
                </CardTitle>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => act(c.id, api.clearDashboard)}
                  >
                    <Eraser className="size-3.5" /> 清除
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  脚本内通过自动注入的{" "}
                  <code className="font-mono text-primary">CLEPSYDRA_REPORT_URL</code> /
                  <code className="font-mono text-primary">REPORT_PORT</code> /
                  <code className="font-mono text-primary">TOKEN</code>{" "}
                  环境变量上报自定义数据（详见设置页示例）。
                </p>
                <Separator className="mb-3" />
                <DashboardData data={s.dashboard} at={s.dashboardAt} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogViewer taskId={c.id} className="h-[calc(100vh-230px)]" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
