import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Hourglass, Minus, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Plat = "windows" | "macos" | "linux" | "other";

function detectPlatform(): Plat {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Linux")) return "linux";
  return "other";
}

/**
 * 自定义标题栏：
 * - Windows / Linux：右侧自绘 最小化/最大化/关闭 按钮（Linux 为圆形悬停）
 * - macOS：hiddenInset 模式保留系统红绿灯，仅提供拖拽区与标题
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const plat = detectPlatform();
  const win = getCurrentWindow();

  useEffect(() => {
    let mounted = true;
    win.isMaximized().then((m) => mounted && setMaximized(m));
    const un = win.onResized(async () => {
      const m = await getCurrentWindow().isMaximized();
      if (mounted) setMaximized(m);
    });
    return () => {
      mounted = false;
      un.then((f) => f());
    };
  }, []);

  const isMac = plat === "macos";
  const isLinux = plat === "linux";

  // Windows 风格：宽扁方形按钮；Linux 风格：圆形按钮
  const ctrl = isLinux
    ? "flex items-center justify-center my-1 mr-1.5 size-8 rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none"
    : "flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none";

  return (
    <div
      data-tauri-drag-region
      className="bg-card/40 flex h-10 shrink-0 items-center border-b select-none"
    >
      {/* macOS 红绿灯占位 */}
      {isMac && <div data-tauri-drag-region className="h-full w-[76px]" />}

      <div data-tauri-drag-region className="flex h-full items-center gap-2 px-4">
        <Hourglass className="text-primary size-4" />
        <span className="text-[13px] font-medium text-muted-foreground select-none">
          Clepsydra
        </span>
      </div>

      <div data-tauri-drag-region className="h-full flex-1" />

      {!isMac && (
        <div className="flex h-full items-stretch">
          <button aria-label="最小化" className={ctrl} onClick={() => win.minimize()}>
            <Minus className="size-3.5" />
          </button>
          <button
            aria-label={maximized ? "还原" : "最大化"}
            className={ctrl}
            onClick={() => win.toggleMaximize()}
          >
            {maximized ? <Copy className="size-3.5" /> : <Square className="size-3" />}
          </button>
          <button
            aria-label="关闭"
            className={cn(ctrl, "hover:bg-[#c42b1c] hover:text-white")}
            onClick={() => win.close()}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
