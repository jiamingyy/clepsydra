import { Inbox } from "lucide-react";

import { fmtTime } from "@/lib/format";

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function DashboardData({
  data,
  at,
  compact,
}: {
  data: unknown;
  at: number | null;
  compact?: boolean;
}) {
  if (data === null || data === undefined) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <Inbox className="size-3.5" />
        {compact ? "暂无上报数据" : "任务尚未上报任何数据"}
      </div>
    );
  }

  let body: React.ReactNode;
  if (typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      body = <div className="text-xs text-muted-foreground/70">（空对象）</div>;
    } else {
      const shown = compact ? entries.slice(0, 4) : entries;
      body = (
        <div className="w-full">
          {shown.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-border/50 py-1.5 last:border-0">
              <span className="w-fit shrink-0 font-mono text-xs text-primary">{k}</span>
              <span className="min-w-0 flex-1 break-all font-mono text-xs">{renderValue(v)}</span>
            </div>
          ))}
          {compact && entries.length > 4 && (
            <div className="pt-1 text-[11px] text-muted-foreground">… 共 {entries.length} 项</div>
          )}
        </div>
      );
    }
  } else {
    body = <pre className="m-0 font-mono text-xs break-all whitespace-pre-wrap">{renderValue(data)}</pre>;
  }

  return (
    <div>
      {body}
      {at != null && (
        <div className="mt-1.5 text-[11px] text-muted-foreground/70">上报于 {fmtTime(at)}</div>
      )}
    </div>
  );
}
