import { useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  Clock,
  CopyPlus,
  History,
  Infinity as InfinityIcon,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Play,
  RefreshCw,
  RotateCw,
  Square,
  Terminal,
  Timer,
  Trash2,
} from "lucide-react";

import { api } from "@/api";
import { DashboardData } from "@/components/DashboardData";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useTaskActions } from "@/hooks/use-task-actions";
import { countdown, fmtDuration, fmtTime } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { isActiveStatus, type TaskConfig, type TaskWithState } from "@/types";

function Line({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: "warn" | "error";
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon
        className={
          tone === "error"
            ? "mt-0.5 size-3.5 shrink-0 text-red-500 dark:text-red-400"
            : tone === "warn"
              ? "mt-0.5 size-3.5 shrink-0 text-orange-500 dark:text-orange-400"
              : "mt-0.5 size-3.5 shrink-0 text-muted-foreground/70"
        }
      />
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 flex-1 break-all", tone === "error" && "text-red-500 dark:text-red-400")}>
        {value}
      </span>
    </div>
  );
}

export function TaskCard({
  task,
  now,
  onOpen,
  onEdit,
}: {
  task: TaskWithState;
  now: number;
  onOpen: () => void;
  onEdit: (config: TaskConfig) => void;
}) {
  const { config: c, state: s } = task;
  const { act, busy } = useTaskActions();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isBusy = busy(c.id) || deleting;
  const active = isActiveStatus(s.status);

  const envChip =
    c.envMode.type === "uv" ? (
      <>
        <Package className="size-3" /> uv 环境
      </>
    ) : (
      <>
        <Terminal className="size-3" /> Python
      </>
    );
  const modeChip =
    c.runMode.type === "cron" ? (
      <>
        <CalendarClock className="size-3" /> {c.runMode.expr}
      </>
    ) : c.runMode.type === "interval" ? (
      <>
        <Clock className="size-3" /> 每 {c.runMode.secs}s
      </>
    ) : (
      <>
        <InfinityIcon className="size-3" /> 常驻
      </>
    );

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteTask(c.id, true);
    } catch (e) {
      notifyError(e);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // 复制任务：克隆全部运行参数，仅名称追加「副本」，默认不自动启动
  const duplicate = async () => {
    try {
      await api.createTask({
        ...c,
        id: "",
        createdAt: 0,
        name: `${c.name} 副本`,
        enabled: false,
      });
      toast.success(`已复制为「${c.name} 副本」`, {
        description: "副本默认未启动，可在卡片上手动启动",
      });
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <>
      <Card
        className="group cursor-pointer gap-4 py-4 transition-colors hover:border-ring/50"
        onClick={onOpen}
      >
        {/* 头部 */}
        <div className="flex items-start justify-between gap-2 px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold">{c.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={s.status} />
              <Badge
                variant="secondary"
                className="gap-1 font-mono text-[10.5px] font-normal text-muted-foreground"
              >
                {envChip}
              </Badge>
              <Badge
                variant="secondary"
                className="gap-1 font-mono text-[10.5px] font-normal text-muted-foreground"
              >
                {modeChip}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MoreVertical className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {!active ? (
                <DropdownMenuItem onClick={() => act(c.id, api.startTask)}>
                  <Play /> 启动
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => act(c.id, api.stopTask)}>
                    <Square /> 停止
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => act(c.id, api.restartTask)}>
                    <RotateCw /> 重启
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(c)}>
                <Pencil /> 编辑
              </DropdownMenuItem>
              <DropdownMenuItem onClick={duplicate}>
                <CopyPlus /> 复制任务
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 dark:text-red-400 focus:text-red-500 dark:focus:text-red-300"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 主体 */}
        <CardContent className="space-y-1.5 px-4">
          {s.status === "running" && s.startedAt != null && (
            <Line
              icon={Timer}
              label="运行"
              value={
                <span className="font-mono">
                  {fmtDuration(now - s.startedAt)}
                  {s.pid != null && <span className="text-muted-foreground"> · pid {s.pid}</span>}
                </span>
              }
            />
          )}
          {s.status === "waitingRestart" && s.nextRunAt != null && (
            <Line
              icon={RefreshCw}
              label="重启"
              tone="warn"
              value={`${countdown(s.nextRunAt - now)}（第 ${s.restartCount} 次）`}
            />
          )}
          {s.status === "idle" && s.nextRunAt != null && (
            <Line
              icon={CalendarClock}
              label="下次"
              value={
                <>
                  {countdown(s.nextRunAt - now)}{" "}
                  <span className="text-muted-foreground">({fmtTime(s.nextRunAt)})</span>
                </>
              }
            />
          )}
          {s.lastError && (
            <Line icon={AlertCircle} label="错误" tone="error" value={s.lastError} />
          )}
          {s.lastExit && s.status !== "running" && (
            <Line
              icon={History}
              label="上次"
              value={
                <>
                  {s.lastExit.success ? (
                    <span className="text-emerald-600 dark:text-emerald-400">成功</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">失败 code={s.lastExit.code ?? "—"}</span>
                  )}{" "}
                  <span className="text-muted-foreground">{fmtTime(s.lastExit.time)}</span>
                </>
              }
            />
          )}
          <Separator className="!my-2" />
          <DashboardData data={s.dashboard} at={s.dashboardAt} compact />
        </CardContent>

        {/* 底部快捷操作 */}
        <CardFooter className="gap-1.5 px-4">
          {!active ? (
            <Button
              size="sm"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                act(c.id, api.startTask);
              }}
            >
              <Play className="size-3.5" /> 启动
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  act(c.id, api.stopTask);
                }}
              >
                <Square className="size-3.5" /> 停止
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  act(c.id, api.restartTask);
                }}
              >
                <RotateCw className="size-3.5" /> 重启
              </Button>
            </>
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground group-hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            详情 <ChevronRight className="size-3.5" />
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>删除任务「{c.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将停止该任务并删除其配置与日志文件，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                doDelete();
              }}
            >
              {deleting ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
