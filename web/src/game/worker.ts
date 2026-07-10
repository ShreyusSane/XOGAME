/// <reference lib="webworker" />
import {
  configure,
  solveFromStart,
  evaluate,
  evaluateChildren,
  memoSize,
  currentMaxStates,
  setProgressCallback,
  TooComplexError,
  type RuleConfig,
} from "./engine";

export type WorkerRequest =
  | { id: number; type: "configure"; config: RuleConfig }
  | { id: number; type: "evaluate"; moves: string }
  | { id: number; type: "children"; moves: string };

export type WorkerResponse =
  | { id: number; type: "ready"; root: ReturnType<typeof solveFromStart>; memoSize: number; timeMs: number; maxStates: number }
  | { id: number; type: "progress"; count: number; maxStates: number }
  | { id: number; type: "evaluation"; result: ReturnType<typeof evaluate> }
  | { id: number; type: "children"; result: ReturnType<typeof evaluateChildren> }
  | { id: number; type: "error"; message: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "configure") {
      const t0 = performance.now();
      setProgressCallback((count) => {
        const progress: WorkerResponse = { id: msg.id, type: "progress", count, maxStates: currentMaxStates() };
        ctx.postMessage(progress);
      });
      configure(msg.config);
      const root = solveFromStart();
      setProgressCallback(null);
      const t1 = performance.now();
      const res: WorkerResponse = {
        id: msg.id,
        type: "ready",
        root,
        memoSize: memoSize(),
        timeMs: t1 - t0,
        maxStates: currentMaxStates(),
      };
      ctx.postMessage(res);
    } else if (msg.type === "evaluate") {
      const result = evaluate(msg.moves);
      const res: WorkerResponse = { id: msg.id, type: "evaluation", result };
      ctx.postMessage(res);
    } else if (msg.type === "children") {
      const result = evaluateChildren(msg.moves);
      const res: WorkerResponse = { id: msg.id, type: "children", result };
      ctx.postMessage(res);
    }
  } catch (err) {
    setProgressCallback(null);
    const message =
      err instanceof TooComplexError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error while solving.";
    const res: WorkerResponse = { id: msg.id, type: "error", message };
    ctx.postMessage(res);
  }
};
