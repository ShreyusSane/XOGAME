import { useCallback, useEffect, useRef, useState } from "react";
import type { Evaluation, ChildEvaluation, Player, RuleConfig } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./worker";

interface EngineState {
  status: "idle" | "loading" | "ready" | "error";
  root: Evaluation | null;
  memoSize: number;
  timeMs: number;
  error?: string;
}

export interface ChildrenResult {
  turn: Player;
  children: ChildEvaluation[];
}

/** Talks to the solver Web Worker. Call configure(rules) to (re)solve the
 * whole game for a given ruleset -- the worker does one expensive full-game
 * solve (cost depends heavily on the rules), then answers all further
 * queries near-instantly from its warm memo cache until reconfigured. */
export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const pending = useRef(new Map<number, (msg: WorkerResponse) => void>());
  const [state, setState] = useState<EngineState>({ status: "idle", root: null, memoSize: 0, timeMs: 0 });

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
      } else if (msg.type === "error") {
        setState((s) => ({ ...s, status: "error", error: msg.message }));
      }
    };
    worker.onerror = (e) => {
      setState((s) => ({ ...s, status: "error", error: e.message }));
    };

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

  const configure = useCallback(
    (config: RuleConfig) => {
      setState({ status: "loading", root: null, memoSize: 0, timeMs: 0 });
      const id = nextId.current++;
      pending.current.set(id, () => {});
      const req: WorkerRequest = { id, type: "configure", config };
      workerRef.current?.postMessage(req);
    },
    [],
  );

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

  return { ...state, configure, evaluate, evaluateChildren };
}
