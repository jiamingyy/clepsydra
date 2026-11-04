export function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return `${d}天${h}时${m}分`;
  if (h > 0) return `${h}时${m}分${ss}秒`;
  if (m > 0) return `${m}分${ss}秒`;
  return `${ss}秒`;
}

export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

export function countdown(ms: number): string {
  if (ms <= 0) return "即将执行";
  return fmtDuration(ms) + "后";
}
