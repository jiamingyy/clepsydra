import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "clepsydra:theme";

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let current: Theme = readTheme();
const listeners = new Set<(t: Theme) => void>();

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  // 与 index.html 预挂载脚本同步：更新画布底色，避免 overscroll 区域露出旧颜色
  document.documentElement.style.background = t === "dark" ? "#121317" : "#ffffff";
}

// 模块加载时立即同步一次（配合 index.html 的预挂载脚本避免闪烁）
apply(current);

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme) {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // ignore
  }
  apply(t);
  listeners.forEach((l) => l(t));
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

export function subscribeTheme(listener: (t: Theme) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState<Theme>(current);
  useEffect(() => subscribeTheme(setT), []);
  return [t, setTheme];
}
