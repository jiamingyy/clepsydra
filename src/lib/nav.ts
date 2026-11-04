export type TaskKind = "long" | "scheduled";

export type BackView = { page: "dashboard" } | { page: "tasks"; kind: TaskKind };

export type View =
  | { page: "dashboard" }
  | { page: "tasks"; kind: TaskKind }
  | { page: "task"; id: string; back: BackView }
  | { page: "settings" };
