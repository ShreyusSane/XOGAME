import { useCallback, useEffect, useRef, useState } from "react";
import type { Evaluation, ChildEvaluation, Player } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./worker";

interface EngineState {
  status: "loading" | "ready" | "error";
  root: Evaluation | null;
  memoSize: number;
  timeMs: number;
  error?: string;
}

export interface ChildrenResult {
  turn: Player;
  children: ChildEvaluation[];
}

/** Talks to the solver Web Worker. The worker does one expensive full-game
 * solve on init (a few seconds -- see engine.ts), then answers all further
 * queries near-instantly from its warm memo cache. */
export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const pending = useRef(new Map<number, (msg: WorkerResponse) => void>());
  const [state, setState] = useState<EngineState>({ status: "loading", root: null, memoSize: 0, timeMs: 0 });

  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const resolve = pending.current.get(msg.id);
      if (resolve) {
        pending.current.delete(msg.id);
        resolve(msg);
      }
      if (msg.type === "ready") {
        setState({ status: "ready", root: msg.root, memoSize: msg.memoSize, timeMs: msg.timeMs });
      }
    };
    worker.onerror = (e) => {
      setState((s) => ({ ...s, status: "error", error: e.message }));
    };

    const id = nextId.current++;
    pending.current.set(id, () => {});
    const req: WorkerRequest = { id, type: "init" };
    worker.postMessage(req);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const request = useCallback(<T extends WorkerResponse>(req: WorkerRequest): Promise<T> => {
    return new Promise((resolve) => {
      pending.current.set(req.id, resolve as (msg: WorkerResponse) => void);
      workerRef.current?.postMessage(req);
    });
  }, []);

  const evaluate = useCallback(
    async (moves: string): Promise<Evaluation> => {
      const id = nextId.current++;
      const res = await request<Extract<WorkerResponse, { type: "evaluation" }>>({ id, type: "evaluate", moves });
      return res.result;
    },
    [request],
  );

  const evaluateChildren = useCallback(
    async (moves: string): Promise<ChildrenResult> => {
      const id = nextId.current++;
      const res = await request<Extract<WorkerResponse, { type: "children" }>>({ id, type: "children", moves });
      return res.result;
    },
    [request],
  );

  return { ...state, evaluate, evaluateChildren };
}
