// Fast packed-state game-tree engine, generalized to arbitrary rules:
// Alice wins on `aliceCount` disjoint identical length-`aliceLen` blocks,
// Bob wins on `bobCount` disjoint identical length-`bobLen` blocks. The
// classic game is aliceLen=5, aliceCount=2, bobLen=3, bobCount=4.
//
// This is the performance-critical twin of ../../../solver.py: same rules,
// same minimax preference order (win fastest / draw with an
// arbitrary-but-deterministic fastest tie-break / prolong a forced loss as
// long as possible), but using flat typed arrays and in-place mutate+undo
// recursion instead of Python's dict copying, and storing claims as
// absolute end-positions (capped only when building the memo key) instead
// of maintaining rolling gaps -- so there is no per-move O(pattern count)
// sweep. Only *active* (claimed at least once) patterns are ever iterated,
// via a small stack per side, so memo-key construction stays cheap even
// when the pattern space (2^len) is large.
//
// Characters are represented as 0 ('X') / 1 ('O') throughout for speed;
// convert at the API boundary only.

export interface RuleConfig {
  aliceLen: number;
  aliceCount: number;
  bobLen: number;
  bobCount: number;
  /** Cap on how many positions (memo entries) the solver will explore
   * before giving up gracefully. Defaults to DEFAULT_MAX_STATES if
   * omitted; always clamped to [MIN_MAX_STATES, MAX_STATES_HARD_CAP]. */
  maxStates?: number;
}

export const CLASSIC_RULES: RuleConfig = { aliceLen: 5, aliceCount: 2, bobLen: 3, bobCount: 4 };

// Hard safety caps, independent of whatever the UI enforces -- protects
// against a pattern space (2^len) or a memo blowup large enough to hang or
// crash the tab. These aren't just about total state *count*: the number
// of simultaneously-active patterns (and so each memo key's size) can grow
// with the game length too, so MAX_MOVE_LENGTH matters as much as
// MAX_STATES for bounding worst-case memory, not just search time.
export const MAX_BLOCK_LEN = 10; // 2^10 = 1024 possible patterns per side
export const MAX_COUNT = 8;
export const DEFAULT_MAX_STATES = 4_500_000; // the classic ruleset alone needs ~3.19M
export const MIN_MAX_STATES = 10_000;
export const MAX_STATES_HARD_CAP = 100_000_000; // absolute ceiling regardless of what the UI asks for
const MAX_MOVE_LENGTH = 1000;

// How often (in newly-memoized positions) the worker is told how far along
// the search is. Small enough to feel live, large enough that posting the
// message itself isn't a meaningful chunk of the work.
const PROGRESS_INTERVAL = 25_000;
let progressCallback: ((count: number) => void) | null = null;
export function setProgressCallback(cb: ((count: number) => void) | null) {
  progressCallback = cb;
}

export type Player = "A" | "B";
export type Result = "A" | "B" | "Draw" | null;

export class TooComplexError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TooComplexError";
  }
}

function validate(cfg: RuleConfig) {
  const { aliceLen, aliceCount, bobLen, bobCount, maxStates } = cfg;
  if (![aliceLen, aliceCount, bobLen, bobCount].every((v) => Number.isInteger(v) && v >= 1)) {
    throw new TooComplexError("All of A, n, B, m must be positive integers.");
  }
  if (aliceLen > MAX_BLOCK_LEN || bobLen > MAX_BLOCK_LEN) {
    throw new TooComplexError(`Block length can't exceed ${MAX_BLOCK_LEN} (browser memory safety limit).`);
  }
  if (aliceCount > MAX_COUNT || bobCount > MAX_COUNT) {
    throw new TooComplexError(`Block count can't exceed ${MAX_COUNT} (this blows up combinatorially).`);
  }
  if (maxStates !== undefined && !Number.isInteger(maxStates)) {
    throw new TooComplexError("Max positions must be an integer.");
  }
}

// --- mutable packed state, (re)allocated by configure() -------------------

let cfg: RuleConfig = CLASSIC_RULES;
let maxStatesLimit = DEFAULT_MAX_STATES;
let tailBits = 0;
let tailLen = 0;
let length = 0;
let tailMask = 0;

let claimsACount!: Int32Array;
let claimsAEnd!: Int32Array;
let claimsBCount!: Int32Array;
let claimsBEnd!: Int32Array;
let activeA: number[] = [];
let activeB: number[] = [];

let memo = new Map<string, Outcome>();

export function configure(newCfg: RuleConfig) {
  validate(newCfg);
  cfg = newCfg;
  maxStatesLimit = Math.min(
    MAX_STATES_HARD_CAP,
    Math.max(MIN_MAX_STATES, newCfg.maxStates ?? DEFAULT_MAX_STATES),
  );
  const tailBitsWidth = Math.max(cfg.aliceLen, cfg.bobLen) - 1;
  tailMask = tailBitsWidth === 0 ? 0 : (1 << tailBitsWidth) - 1;
  claimsACount = new Int32Array(1 << cfg.aliceLen);
  claimsAEnd = new Int32Array(1 << cfg.aliceLen);
  claimsBCount = new Int32Array(1 << cfg.bobLen);
  claimsBEnd = new Int32Array(1 << cfg.bobLen);
  activeA = [];
  activeB = [];
  memo = new Map();
  reset();
}

function reset() {
  tailBits = 0;
  tailLen = 0;
  length = 0;
  for (const i of activeA) {
    claimsACount[i] = 0;
    claimsAEnd[i] = 0;
  }
  for (const i of activeB) {
    claimsBCount[i] = 0;
    claimsBEnd[i] = 0;
  }
  activeA = [];
  activeB = [];
}

interface Undo {
  prevTailBits: number;
  prevTailLen: number;
  idxA: number;
  prevCountA: number;
  prevEndA: number;
  newlyActiveA: boolean;
  idxB: number;
  prevCountB: number;
  prevEndB: number;
  newlyActiveB: boolean;
}

// activeA/activeB are kept sorted by pattern index at all times (insertion
// on push, removal by value on pop) so buildKey() can iterate them directly
// without allocating/sorting a copy on every single solve() call -- that
// used to run millions of times and was the dominant source of GC pressure
// (it worked, but ran the browser out of memory on the classic ruleset).
// These arrays are always small (bounded by moves played so far along the
// current path), so the O(n) insert/remove here is cheap.
function insertSorted(arr: number[], v: number) {
  let i = arr.length;
  arr.push(v);
  while (i > 0 && arr[i - 1] > v) {
    arr[i] = arr[i - 1];
    i--;
  }
  arr[i] = v;
}

function removeValue(arr: number[], v: number) {
  arr.splice(arr.indexOf(v), 1);
}

function applyMove(c: 0 | 1): { result: Result; undo: Undo } {
  const prevTailBits = tailBits;
  const prevTailLen = tailLen;
  const newLength = length + 1;
  let aliceWin = false;
  let bobWin = false;
  let idxA = -1;
  let prevCountA = 0;
  let prevEndA = 0;
  let newlyActiveA = false;
  let idxB = -1;
  let prevCountB = 0;
  let prevEndB = 0;
  let newlyActiveB = false;

  if (newLength >= cfg.aliceLen) {
    const kBits = cfg.aliceLen - 1;
    const mask = kBits === 0 ? 0 : (1 << kBits) - 1;
    const w = ((tailBits & mask) << 1) | c;
    const start = newLength - cfg.aliceLen + 1;
    const cnt = claimsACount[w];
    const prevEnd = claimsAEnd[w];
    if (start > prevEnd) {
      idxA = w;
      prevCountA = cnt;
      prevEndA = prevEnd;
      newlyActiveA = cnt === 0;
      const newCnt = cnt + 1;
      claimsACount[w] = newCnt;
      claimsAEnd[w] = newLength;
      if (newlyActiveA) insertSorted(activeA, w);
      if (newCnt >= cfg.aliceCount) aliceWin = true;
    }
  }

  if (newLength >= cfg.bobLen) {
    const kBits = cfg.bobLen - 1;
    const mask = kBits === 0 ? 0 : (1 << kBits) - 1;
    const w = ((tailBits & mask) << 1) | c;
    const start = newLength - cfg.bobLen + 1;
    const cnt = claimsBCount[w];
    const prevEnd = claimsBEnd[w];
    if (start > prevEnd) {
      idxB = w;
      prevCountB = cnt;
      prevEndB = prevEnd;
      newlyActiveB = cnt === 0;
      const newCnt = cnt + 1;
      claimsBCount[w] = newCnt;
      claimsBEnd[w] = newLength;
      if (newlyActiveB) insertSorted(activeB, w);
      if (newCnt >= cfg.bobCount) bobWin = true;
    }
  }

  tailBits = ((tailBits << 1) | c) & tailMask;
  tailLen = Math.min(tailLen + 1, Math.max(cfg.aliceLen, cfg.bobLen) - 1);
  length = newLength;

  let result: Result = null;
  if (aliceWin && bobWin) result = "Draw";
  else if (aliceWin) result = "A";
  else if (bobWin) result = "B";

  if (result === null && length > MAX_MOVE_LENGTH) {
    throw new TooComplexError(
      `Game exceeded ${MAX_MOVE_LENGTH} moves without resolving -- this ruleset is too large to solve in the browser.`,
    );
  }

  return {
    result,
    undo: { prevTailBits, prevTailLen, idxA, prevCountA, prevEndA, newlyActiveA, idxB, prevCountB, prevEndB, newlyActiveB },
  };
}

function undoMove(u: Undo) {
  length -= 1;
  tailBits = u.prevTailBits;
  tailLen = u.prevTailLen;
  if (u.idxA !== -1) {
    claimsACount[u.idxA] = u.prevCountA;
    claimsAEnd[u.idxA] = u.prevEndA;
    if (u.newlyActiveA) removeValue(activeA, u.idxA);
  }
  if (u.idxB !== -1) {
    claimsBCount[u.idxB] = u.prevCountB;
    claimsBEnd[u.idxB] = u.prevEndB;
    if (u.newlyActiveB) removeValue(activeB, u.idxB);
  }
}

// activeA/activeB are maintained in sorted-by-pattern-index order (see
// insertSorted/removeValue above), which is what makes the key canonical
// regardless of which move order led to this state -- two different
// histories reaching the same underlying position must produce the same
// key so they share one memo entry.
function buildKey(turn: Player): string {
  let a = "";
  for (const p of activeA) {
    const gap = Math.min(length - claimsAEnd[p], cfg.aliceLen - 1);
    const combo = claimsACount[p] * cfg.aliceLen + gap;
    a += String.fromCharCode(p, combo);
  }
  let b = "";
  for (const p of activeB) {
    const gap = Math.min(length - claimsBEnd[p], cfg.bobLen - 1);
    const combo = claimsBCount[p] * cfg.bobLen + gap;
    b += String.fromCharCode(p, combo);
  }
  return String.fromCharCode(tailBits, tailLen) + turn + a + "|" + b;
}

// --- minimax ---------------------------------------------------------------

type Outcome = [Result, number, 0 | 1]; // result, moves remaining, best move

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

  if (memo.size > maxStatesLimit) {
    throw new TooComplexError(
      `This ruleset needs more than ${maxStatesLimit.toLocaleString()} positions to solve -- raise the max positions limit, or try smaller numbers.`,
    );
  }

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
  if (progressCallback && memo.size % PROGRESS_INTERVAL === 0) {
    progressCallback(memo.size);
  }
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

/** Solve the whole game from the start. This is the expensive call; the
 * exact cost depends heavily on the configured rules. Everything else is
 * fast afterward since the root-level search touches nearly every
 * reachable state. */
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

export function currentConfig(): RuleConfig {
  return cfg;
}

export function currentMaxStates(): number {
  return maxStatesLimit;
}
