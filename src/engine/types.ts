// Scenario format: a small typed op list. Arbitrary JS is never parsed or run.
// `line` is a 1-based index into Scenario.code, used only for highlighting.

interface OpBase {
  line?: number;
}

export type Op =
  | (OpBase & { op: "log"; text: string })
  | (OpBase & { op: "setTimeout"; delayMs: number; body: Op[]; label?: string })
  | (OpBase & { op: "setImmediate"; body: Op[]; label?: string })
  | (OpBase & { op: "nextTick"; body: Op[]; label?: string })
  | (OpBase & { op: "promiseThen"; body: Op[]; label?: string }) // already-resolved promise
  | (OpBase & { op: "await"; rest: Op[] }) // must be the last op of an async callFn
  | (OpBase & { op: "readFile"; path?: string; body: Op[]; label?: string })
  | (OpBase & { op: "callFn"; name: string; body: Op[]; async?: boolean })
  | (OpBase & { op: "block"; ms: number }); // busy loop: advances the virtual clock

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  code: string[]; // display-only source lines
  ops: Op[];
  expectedOutput: string[];
  /** Offer the "timer already elapsed when loop starts" toggle in the UI. */
  hasTimerRace?: boolean;
}

export interface SimulateOptions {
  /** Top-level setTimeout(0) vs setImmediate: is the 1ms timer already due when the loop starts? */
  timerElapsedAtLoopStart?: boolean;
}

export type Phase = "timers" | "pending" | "poll" | "check" | "close";

export type Region =
  | "callStack"
  | "heap"
  | "nextTick"
  | "microtask"
  | "timersQ"
  | "pendingQ"
  | "pollQ"
  | "checkQ"
  | "closeQ"
  | "apis"
  | "console"
  | "phase";

export type TaskKind = "script" | "timer" | "immediate" | "tick" | "microtask" | "io" | "fn";

export interface Task {
  id: string; // stable for the task's whole life, so the UI can animate its movement
  label: string;
  kind: TaskKind;
}

export interface HeapObject {
  id: string;
  type: "closure" | "promise" | "asyncFrame";
  label: string;
  state?: "pending" | "resolved" | "suspended";
}

export interface PendingApi {
  id: string;
  kind: "timer" | "io";
  label: string;
  dueAt: number; // virtual ms
}

export interface Step {
  index: number;
  caption: string;
  highlight: Region[];
  activeLine?: number;
  phase: Phase | null; // null during the main script and while draining before the loop starts
  clock: number;
  callStack: Task[]; // bottom first
  heap: HeapObject[];
  nextTickQueue: Task[];
  microtaskQueue: Task[];
  phaseQueues: Record<Phase, Task[]>;
  pendingApis: PendingApi[];
  console: string[];
  moved?: { taskId: string; from: Region; to: Region };
}
