import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { TaskForm } from "@/components/TaskForm";
import { TitleBar } from "@/components/title-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BackView, View } from "@/lib/nav";
import { Dashboard } from "@/pages/Dashboard";
import { Settings } from "@/pages/Settings";
import { TaskDetail } from "@/pages/TaskDetail";
import { TaskList } from "@/pages/TaskList";
import { StoreProvider } from "@/store";
import type { TaskConfig } from "@/types";

const SIDEBAR_KEY = "clepsydra:sidebar-collapsed";

function Shell() {
  const [view, setView] = useState<View>({ page: "dashboard" });
  // null：关闭；TaskConfig | null：initial（null = 全新建，对象 = 编辑或预设）
  const [formInitial, setFormInitial] = useState<TaskConfig | null | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const openForm = (initial: TaskConfig | null) => setFormInitial(initial);
  const closeForm = () => setFormInitial(undefined);

  const openTask = (id: string, back: BackView) => setView({ page: "task", id, back });

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          view={view}
          onNavigate={setView}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />

        <main className="h-full min-w-0 flex-1 overflow-y-auto">
          {view.page === "dashboard" && (
            <Dashboard
              onOpenTask={(id) => openTask(id, { page: "dashboard" })}
              onEditTask={(c) => openForm(c)}
              onNewTask={() => openForm(null)}
            />
          )}
          {view.page === "tasks" && (
            <TaskList
              kind={view.kind}
              onOpenTask={(id) => openTask(id, { page: "tasks", kind: view.kind })}
              onEditTask={(c) => openForm(c)}
              onNewTask={(preset) => openForm(preset)}
            />
          )}
          {view.page === "task" && (
            <TaskDetail
              id={view.id}
              onBack={() => setView(view.back)}
              onEditTask={(c) => openForm(c)}
            />
          )}
          {view.page === "settings" && <Settings />}
        </main>
      </div>

      {formInitial !== undefined && (
        <TaskForm initial={formInitial} onClose={closeForm} onSaved={closeForm} />
      )}

      <Toaster position="bottom-center" />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </StoreProvider>
  );
}
