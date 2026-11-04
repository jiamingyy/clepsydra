import { cn } from "@/lib/utils";
import { STATUS_LABELS, type TaskStatus } from "@/types";

const STATUS_STYLE: Record<TaskStatus, string> = {
  running:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-400",
  starting:
    "border-amber-600/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/30 dark:text-amber-400",
  stopping:
    "border-amber-600/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/30 dark:text-amber-400",
  waitingRestart:
    "border-orange-600/30 bg-orange-500/10 text-orange-600 dark:border-orange-500/30 dark:text-orange-400",
  idle: "border-sky-600/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/30 dark:text-sky-400",
  disabled:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-500 dark:border-zinc-500/30 dark:text-zinc-400",
  failed: "border-red-600/30 bg-red-500/10 text-red-600 dark:border-red-500/30 dark:text-red-400",
  exited: "border-teal-600/30 bg-teal-500/10 text-teal-600 dark:border-teal-500/30 dark:text-teal-400",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap",
        STATUS_STYLE[status],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          status === "running" && "animate-pulse",
        )}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
