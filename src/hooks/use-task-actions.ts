import { useCallback, useState } from "react";
import { notifyError } from "@/lib/notify";
import { useStore } from "@/store";

export function useTaskActions() {
  const { refresh } = useStore();
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const act = useCallback(
    async (id: string, fn: (id: string) => Promise<void>) => {
      setBusyIds((prev) => new Set(prev).add(id));
      try {
        await fn(id);
        await refresh();
      } catch (e) {
        notifyError(e);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [refresh],
  );

  const busy = useCallback((id: string) => busyIds.has(id), [busyIds]);

  return { act, busy };
}
