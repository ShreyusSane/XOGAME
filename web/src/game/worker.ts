/// <reference lib="webworker" />
import { solveFromStart, evaluate, evaluateChildren, memoSize } from "./engine";

export type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "evaluate"; moves: string }
  | { id: number; type: "children"; moves: string };

export type WorkerResponse =
  | { id: number; type: "ready"; root: ReturnType<typeof solveFromStart>; memoSize: number; timeMs: number }
  | { id: number; type: "evaluation"; result: ReturnType<typeof evaluate> }
  | { id: number; type: "children"; result: ReturnType<typeof evaluateChildren> };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    const t0 = performance.now();
    const root = solveFromStart();
    const t1 = performance.now();
    const res: WorkerResponse = { id: msg.id, type: "ready", root, memoSize: memoSize(), timeMs: t1 - t0 };
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
};
