import {
  CalendarClock,
  ChevronDown,
  Hourglass,
  Infinity as InfinityIcon,
  LayoutDashboard,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TaskKind, View } from "@/lib/nav";
import { useStore } from "@/store";

function NavItem({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  indent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  indent?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      onClick={(e) => {
        e.currentTarget.blur(); // 释放焦点，避免窗口拖拽后焦点回归触发 tooltip
        onClick();
      }}
      className={cn(
        "h-9 w-full justify-start gap-2.5 px-3 text-sm font-normal",
        indent ? "ml-3 w-[calc(100%-0.75rem)] text-[13px]" : "",
        active
          ? "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4", active && "text-primary")} />
      {label}
      {count != null && count > 0 && (
        <Badge variant="secondary" className="ml-auto h-5 min-w-5 px-1.5 text-[10.5px]">
          {count}
        </Badge>
      )}
    </Button>
  );
}

/** 收起态的图标导轨项（悬停显示名称） */
function RailItem({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.currentTarget.blur(); // 释放焦点，避免窗口拖拽后焦点回归触发 tooltip
            onClick();
          }}
          className={cn(
            "relative",
            active
              ? "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className={cn("size-[18px]", active && "text-primary")} />
          {count != null && count > 0 && (
            <span className="bg-primary absolute top-1.5 right-1.5 size-1.5 rounded-full" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {count != null && count > 0 ? ` · ${count}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  view,
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: {
  view: View;
  onNavigate: (v: View) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { tasks } = useStore();
  const longCount = tasks.filter((t) => t.config.runMode.type === "long_running").length;
  const scheduledCount = tasks.filter((t) => t.config.runMode.type !== "long_running").length;

  const tasksActive =
    view.page === "tasks" || (view.page === "task" && view.back.page === "tasks");

  const goKind = (kind: TaskKind) => onNavigate({ page: "tasks", kind });

  return (
    <aside
      className={cn(
        "bg-card/40 flex h-full shrink-0 flex-col border-r transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {collapsed ? (
        <>
          {/* 收起态：图标导轨 */}
          <div className="flex flex-col items-center gap-1 px-2 pt-4 pb-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.currentTarget.blur(); onToggleCollapsed(); }}>
                  <PanelLeftOpen className="size-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">展开侧边栏</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-col items-center gap-1 px-2">
            <RailItem
              active={view.page === "dashboard"}
              onClick={() => onNavigate({ page: "dashboard" })}
              icon={LayoutDashboard}
              label="仪表盘"
              count={tasks.length}
            />
            <Separator className="my-1 w-8" />
            <RailItem
              active={view.page === "tasks" && view.kind === "long"}
              onClick={() => goKind("long")}
              icon={InfinityIcon}
              label="常驻任务"
              count={longCount}
            />
            <RailItem
              active={view.page === "tasks" && view.kind === "scheduled"}
              onClick={() => goKind("scheduled")}
              icon={CalendarClock}
              label="定时任务"
              count={scheduledCount}
            />
          </div>
          <div className="mt-auto flex flex-col items-center gap-1 p-2">
            <Separator className="mb-2 w-8" />
            <RailItem
              active={view.page === "settings"}
              onClick={() => onNavigate({ page: "settings" })}
              icon={Settings}
              label="设置"
            />
          </div>
        </>
      ) : (
        <>
          {/* 展开态 */}
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-4">
            <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Hourglass className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">Clepsydra</div>
              <div className="truncate text-[11px] text-muted-foreground">Python 任务管理</div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={(e) => {
                    e.currentTarget.blur(); // 释放焦点，避免窗口拖拽后焦点回归触发 tooltip
                    onToggleCollapsed();
                  }}
                >
                  <PanelLeftClose className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">收起侧边栏</TooltipContent>
            </Tooltip>
          </div>

          <Separator />

          <nav className="flex flex-col gap-1 p-3">
            <NavItem
              active={view.page === "dashboard"}
              onClick={() => onNavigate({ page: "dashboard" })}
              icon={LayoutDashboard}
              label="仪表盘"
              count={tasks.length}
            />

            <Collapsible defaultOpen={tasksActive}>
              <CollapsibleTrigger
                className={cn(
                  "group flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm outline-none transition-colors hover:bg-accent/60",
                  tasksActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MonitorPlay className={cn("size-4", tasksActive && "text-primary")} />
                运行任务
                <ChevronDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-[13px] border-l border-border pl-0.5">
                <div className="mt-1 flex flex-col gap-0.5">
                  <NavItem
                    active={view.page === "tasks" && view.kind === "long"}
                    onClick={() => goKind("long")}
                    icon={InfinityIcon}
                    label="常驻任务"
                    count={longCount}
                    indent
                  />
                  <NavItem
                    active={view.page === "tasks" && view.kind === "scheduled"}
                    onClick={() => goKind("scheduled")}
                    icon={CalendarClock}
                    label="定时任务"
                    count={scheduledCount}
                    indent
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </nav>

          <div className="mt-auto flex flex-col gap-1 p-3">
            <Separator className="mb-2" />
            <NavItem
              active={view.page === "settings"}
              onClick={() => onNavigate({ page: "settings" })}
              icon={Settings}
              label="设置"
            />
            <div className="px-3 pt-2 text-[11px] text-muted-foreground/60">v0.1.0</div>
          </div>
        </>
      )}
    </aside>
  );
}
