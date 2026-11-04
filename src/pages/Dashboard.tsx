import { useMemo } from "react";
import { Activity, AlertCircle, CalendarClock, Inbox, ListTodo, Plus } from "lucide-react";

import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStore } from "@/store";
import type { TaskConfig } from "@/types";

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "default" | "ok" | "info" | "err";
}) {
  const toneCls = {
    default: "bg-primary/10 text-primary",
    ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    err: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[tone];
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>
          <Icon className="size-4.5" />
        </div>
        <div>
          <div className="text-xl leading-tight font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard({
  onOpenTask,
  onEditTask,
  onNewTask,
}: {
  onOpenTask: (id: string) => void;
  onEditTask: (config: TaskConfig) => void;
  onNewTask: () => void;
}) {
  const { tasks, now, ready } = useStore();

  const stats = useMemo(() => {
    let running = 0;
    let failed = 0;
    let scheduled = 0;
    for (const t of tasks) {
      if (t.state.status === "running") running++;
      else if (t.state.status === "failed") failed++;
      if (t.config.runMode.type !== "long_running" && t.config.enabled) scheduled++;
    }
    return { total: tasks.length, running, failed, scheduled };
  }, [tasks]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">仪表盘</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            所有任务状态与实时上报信息
          </p>
        </div>
        <Button onClick={onNewTask}>
          <Plus className="size-4" /> 新建任务
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ListTodo} label="全部任务" value={stats.total} tone="default" />
        <StatCard icon={Activity} label="运行中" value={stats.running} tone="ok" />
        <StatCard icon={CalendarClock} label="定时启用" value={stats.scheduled} tone="info" />
        <StatCard icon={AlertCircle} label="失败" value={stats.failed} tone="err" />
      </div>

      {ready && tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
          <Inbox className="size-10 text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">还没有任务</div>
          <div className="text-xs text-muted-foreground/70">
            点击右上角「新建任务」，把你的 Python 脚本交给 Clepsydra 管理
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tasks.map((t) => (
            <TaskCard
              key={t.config.id}
              task={t}
              now={now}
              onOpen={() => onOpenTask(t.config.id)}
              onEdit={onEditTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
