import { toast } from "sonner";

export function errorMessage(e: unknown): string {
  return typeof e === "string" ? e : String((e as { message?: string })?.message ?? e);
}

export function notifyError(e: unknown) {
  console.error(e);
  toast.error("操作失败", { description: errorMessage(e) });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  } catch {
    toast.error("复制失败");
  }
}
