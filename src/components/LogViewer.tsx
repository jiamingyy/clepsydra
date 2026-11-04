import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Trash2 } from "lucide-react";

import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface LogPayload {
  taskId: string;
  lines: string[];
}

const MAX_VIEW_LINES = 1500;

function lineClass(line: string): string {
  if (line.includes(" [err] ")) return "text-red-500 dark:text-red-400";
  if (line.includes(" [sys] ")) return "text-muted-foreground/80";
  return "text-zinc-700 dark:text-zinc-300";
}

export function LogViewer({ taskId, className }: { taskId: string; className?: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [autoscroll, setAutoscroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines(null);
    let alive = true;
    api
      .getLogHistory(taskId, 800)
      .then((ls) => alive && setLines(ls))
      .catch(() => alive && setLines([]));
    const un = listen<LogPayload>("clepsydra://log", (e) => {
      if (e.payload.taskId !== taskId) return;
      setLines((prev) => {
        const base = prev ?? [];
        const merged = base.concat(e.payload.lines);
        return merged.length > MAX_VIEW_LINES ? merged.slice(merged.length - MAX_VIEW_LINES) : merged;
      });
    });
    return () => {
      alive = false;
      un.then((f) => f());
    };
  }, [taskId]);

  useEffect(() => {
    if (autoscroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines, autoscroll]);

  const count = lines?.length ?? 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-zinc-50 dark:bg-zinc-950",
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b bg-card/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`autoscroll-${taskId}`}
            checked={autoscroll}
            onCheckedChange={setAutoscroll}
          />
          <Label
            htmlFor={`autoscroll-${taskId}`}
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            自动滚动
          </Label>
        </div>
        <Badge variant="secondary" className="font-mono text-[10.5px]">
          {lines === null ? "…" : `${count} 行`}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => setLines([])}
        >
          <Trash2 className="size-3.5" />
          清空视图
        </Button>
      </div>
      <div
        ref={boxRef}
        className="log-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3 select-text"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (atBottom !== autoscroll) setAutoscroll(atBottom);
        }}
      >
        {lines === null ? (
          <div className="font-mono text-xs text-muted-foreground">加载中…</div>
        ) : count === 0 ? (
          <div className="font-mono text-xs text-muted-foreground">暂无日志</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={cn("font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap", lineClass(l))}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
