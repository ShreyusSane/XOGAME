// Fast packed-state game-tree engine. This is the performance-critical twin
// of ../../../solver.py: same rules, same minimax preference order (win
// fastest / draw with an arbitrary-but-deterministic fastest tie-break /
// prolong a forced loss as long as possible), but using flat typed arrays
// and in-place mutate+undo recursion instead of Python's dict copying, and
// storing claims as absolute end-positions (capped only when building the
// memo key) instead of maintaining rolling gaps -- so there is no per-move
// O(pattern count) sweep.
//
// Characters are represented as 0 ('X') / 1 ('O') throughout for speed;
// convert at the API boundary only.

const ALICE_LEN = 5;
const BOB_LEN = 3;
const BOB_COUNT = 4;
const TAIL_MASK = 0b1111;

export type Player = "A" | "B";
export type Result = "A" | "B" | "Draw" | null;

// --- mutable packed state -------------------------------------------------

let tailBits = 0;
let tailLen = 0;
let length = 0;
const claims5 = new Int16Array(32).fill(-1); // pattern(5 bits) -> end pos, -1 absent
const claims3Count = new Int8Array(8); // pattern(3 bits) -> count (0 = absent)
const claims3End = new Int16Array(8);

function reset() {
  tailBits = 0;
  tailLen = 0;
  length = 0;
  claims5.fill(-1);
  claims3Count.fill(0);
  claims3End.fill(0);
}

interface Undo {
  prevTailBits: number;
  prevTailLen: number;
  idx5: number;
  prev5: number;
  idx3: number;
  prevCount3: number;
  prevEnd3: number;
}

function applyMove(c: 0 | 1): { result: Result; undo: Undo } {
  const prevTailBits = tailBits;
  const prevTailLen = tailLen;
  const newLength = length + 1;
  let alice = false;
  let bob = false;
  let idx5 = -1;
  let prev5 = -1;
  let idx3 = -1;
  let prevCount3 = 0;
  let prevEnd3 = 0;

  if (newLength >= ALICE_LEN) {
    const w5 = ((tailBits & 0b1111) << 1) | c;
    const start = newLength - ALICE_LEN + 1;
    const prevEnd = claims5[w5];
    if (start > prevEnd) {
      idx5 = w5;
      prev5 = prevEnd;
      if (prevEnd !== -1) alice = true;
      claims5[w5] = newLength;
    }
  }

  if (newLength >= BOB_LEN) {
    const w3 = ((tailBits & 0b11) << 1) | c;
    const start = newLength - BOB_LEN + 1;
    const cnt = claims3Count[w3];
    const prevEnd = claims3End[w3];
    if (start > prevEnd) {
      idx3 = w3;
      prevCount3 = cnt;
      prevEnd3 = prevEnd;
      const newCnt = cnt + 1;
      claims3Count[w3] = newCnt;
      claims3End[w3] = newLength;
      if (newCnt >= BOB_COUNT) bob = true;
    }
  }

  tailBits = ((tailBits << 1) | c) & TAIL_MASK;
  tailLen = Math.min(tailLen + 1, 4);
  length = newLength;

  let result: Result = null;
  if (alice && bob) result = "Draw";
  else if (alice) result = "A";
  else if (bob) result = "B";

  return { result, undo: { prevTailBits, prevTailLen, idx5, prev5, idx3, prevCount3, prevEnd3 } };
}

function undoMove(u: Undo) {
  length -= 1;
  tailBits = u.prevTailBits;
  tailLen = u.prevTailLen;
  if (u.idx5 !== -1) claims5[u.idx5] = u.prev5;
  if (u.idx3 !== -1) {
    claims3Count[u.idx3] = u.prevCount3;
    claims3End[u.idx3] = u.prevEnd3;
  }
}

function buildKey(turn: Player): string {
  let c5 = "";
  for (let p = 0; p < 32; p++) {
    const end = claims5[p];
    if (end !== -1) {
      const gap = Math.min(length - end, ALICE_LEN - 1);
      c5 += p.toString(36) + gap;
    }
  }
  let c3 = "";
  for (let p = 0; p < 8; p++) {
    const cnt = claims3Count[p];
    if (cnt !== 0) {
      const end = claims3End[p];
      const gap = Math.min(length - end, BOB_LEN - 1);
      c3 += p.toString(36) + cnt + gap;
    }
  }
  return tailBits + "." + tailLen + turn + "|" + c5 + "|" + c3;
}

// --- minimax ---------------------------------------------------------------

type Outcome = [Result, number, 0 | 1]; // result, moves remaining, best move

const memo = new Map<string, Outcome>();

function rank(turn: Player, result: Result): number {
  if (result === turn) return 2;
  if (result === "Draw") return 1;
  return 0;
}

function better(turn: Player, a: readonly [Result, number], b: readonly [Result, number]): boolean {
  const [ra, la] = a;
  const [rb, lb] = b;
  const xa = rank(turn, ra);
  const xb = rank(turn, rb);
  if (xa !== xb) return xa > xb;
  if (ra === turn) return la < lb; // winning: faster is better
  if (ra === "Draw") return la < lb; // draw: arbitrary tie-break, prefer faster
  return la > lb; // losing: prolong as long as possible
}

function solve(turn: Player): Outcome {
  const key = buildKey(turn);
  const cached = memo.get(key);
  if (cached) return cached;

  let bestVal: [Result, number] | null = null;
  let bestMove: 0 | 1 = 0;
  const other: Player = turn === "A" ? "B" : "A";

  for (const c of [0, 1] as const) {
    const { result, undo } = applyMove(c);
    let val: [Result, number];
    if (result !== null) {
      val = [result, 1];
    } else {
      const [r, l] = solve(other);
      val = [r, 1 + l];
    }
    undoMove(undo);

    if (bestVal === null || better(turn, val, bestVal)) {
      bestVal = val;
      bestMove = c;
    }
    if (bestVal[0] === turn && bestVal[1] === 1) break;
  }

  const outcome: Outcome = [bestVal![0], bestVal![1], bestMove];
  memo.set(key, outcome);
  return outcome;
}

// --- public API --------------------------------------------------------

function charToBit(ch: string): 0 | 1 {
  return ch === "O" ? 1 : 0;
}
function bitToChar(b: 0 | 1): "X" | "O" {
  return b === 1 ? "O" : "X";
}

function replay(moves: string) {
  reset();
  for (let i = 0; i < moves.length; i++) applyMove(charToBit(moves[i]));
}

export interface Evaluation {
  turn: Player;
  result: Result;
  movesRemaining: number;
  bestMove: "X" | "O";
}

/** Solve the whole game from the start. This is the expensive call (~a few
 * million memoized states); everything else is fast afterward since the
 * root-level search touches nearly every reachable state. */
export function solveFromStart(): Evaluation {
  reset();
  const [result, movesRemaining, bestMove] = solve("A");
  reset();
  return { turn: "A", result, movesRemaining, bestMove: bitToChar(bestMove) };
}

/** Evaluate an arbitrary (non-terminal) position given as a move-sequence
 * string. Requires solveFromStart() to have been called at least once for
 * best performance (otherwise this itself does the full search). */
export function evaluate(moves: string): Evaluation {
  replay(moves);
  const turn: Player = moves.length % 2 === 0 ? "A" : "B";
  const [result, movesRemaining, bestMove] = solve(turn);
  reset();
  return { turn, result, movesRemaining, bestMove: bitToChar(bestMove) };
}

export interface ChildEvaluation {
  move: "X" | "O";
  result: Result;
  movesRemaining: number;
  isOptimal: boolean;
}

/** Evaluate both possible next moves from a given (non-terminal) position,
 * for the game-tree explorer. */
export function evaluateChildren(moves: string): { turn: Player; children: ChildEvaluation[] } {
  replay(moves);
  const turn: Player = moves.length % 2 === 0 ? "A" : "B";
  const other: Player = turn === "A" ? "B" : "A";
  const results: ChildEvaluation[] = [];

  for (const c of [0, 1] as const) {
    const { result, undo } = applyMove(c);
    let r: Result;
    let movesRemaining: number;
    if (result !== null) {
      r = result;
      movesRemaining = 1;
    } else {
      const [rr, ll] = solve(other);
      r = rr;
      movesRemaining = 1 + ll;
    }
    undoMove(undo);
    results.push({ move: bitToChar(c), result: r, movesRemaining, isOptimal: false });
  }
  reset();

  // Mark the move(s) matching the current player's preference as optimal
  // (there can be a tie only if both lead to identical (result,length)).
  let bestIdx = 0;
  for (let i = 1; i < results.length; i++) {
    if (better(turn, [results[i].result, results[i].movesRemaining], [results[bestIdx].result, results[bestIdx].movesRemaining])) {
      bestIdx = i;
    }
  }
  for (let i = 0; i < results.length; i++) {
    const tie =
      results[i].result === results[bestIdx].result && results[i].movesRemaining === results[bestIdx].movesRemaining;
    results[i].isOptimal = tie;
  }

  return { turn, children: results };
}

export function memoSize(): number {
  return memo.size;
}
