import { Infinity as InfinityIcon, CalendarClock, Inbox, Plus } from "lucide-react";

import { TaskCard } from "@/components/TaskCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TaskKind } from "@/lib/nav";
import { useStore } from "@/store";
import { newTaskDraft, type TaskConfig } from "@/types";

const META = {
  long: {
    icon: InfinityIcon,
    title: "常驻任务",
    desc: "长期运行的守护式任务，异常退出按策略自动重启",
  },
  scheduled: {
    icon: CalendarClock,
    title: "定时任务",
    desc: "按 Cron 或固定间隔周期性触发的任务",
  },
} as const;

export function TaskList({
  kind,
  onOpenTask,
  onEditTask,
  onNewTask,
}: {
  kind: TaskKind;
  onOpenTask: (id: string) => void;
  onEditTask: (config: TaskConfig) => void;
  onNewTask: (preset: TaskConfig) => void;
}) {
  const { tasks, now, ready } = useStore();
  const meta = META[kind];
  const Icon = meta.icon;

  const list = tasks.filter((t) =>
    kind === "long"
      ? t.config.runMode.type === "long_running"
      : t.config.runMode.type !== "long_running",
  );

  const newPreset = () => {
    const draft = newTaskDraft();
    onNewTask(
      kind === "long"
        ? draft
        : { ...draft, runMode: { type: "interval", secs: 60 } },
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-semibold">
              {meta.title}
              <Badge variant="secondary" className="text-[11px] font-normal">
                {list.length}
              </Badge>
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{meta.desc}</p>
          </div>
        </div>
        <Button onClick={newPreset}>
          <Plus className="size-4" /> 新建任务
        </Button>
      </div>

      {ready && list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
          <Inbox className="size-10 text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">暂无{meta.title}</div>
          <div className="text-xs text-muted-foreground/70">
            点击右上角「新建任务」，运行模式会自动预选
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {list.map((t) => (
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
