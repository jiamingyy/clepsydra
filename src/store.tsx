import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import type { TaskWithState } from "./types";

interface Store {
  tasks: TaskWithState[];
  now: number;
  ready: boolean;
  refresh: () => Promise<void>;
  byId: (id: string) => TaskWithState | undefined;
}

const Ctx = createContext<Store>(null as unknown as Store);

export function useStore(): Store {
  return useContext(Ctx);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<TaskWithState[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.listTasks());
    } catch (e) {
      console.error("刷新任务列表失败", e);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unStatus = listen<TaskWithState>("clepsydra://status", (e) => {
      setTasks((prev) => {
        const i = prev.findIndex((t) => t.config.id === e.payload.config.id);
        if (i === -1) return [...prev, e.payload];
        const next = [...prev];
        next[i] = e.payload;
        return next;
      });
    });
    const unDeleted = listen<{ id: string }>("clepsydra://deleted", (e) => {
      setTasks((prev) => prev.filter((t) => t.config.id !== e.payload.id));
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unStatus.then((f) => f());
      unDeleted.then((f) => f());
      clearInterval(timer);
    };
  }, [refresh]);

  const byId = useCallback((id: string) => tasks.find((t) => t.config.id === id), [tasks]);

  return <Ctx.Provider value={{ tasks, now, ready, refresh, byId }}>{children}</Ctx.Provider>;
}
