// Core rules for the XO game, as a simple string-based reference
// implementation. This mirrors ../../../rules.py exactly and is used by the
// UI for display/history bookkeeping and by tests as a slow-but-obviously-
// correct reference against the fast packed-state engine in engine.ts.
//
// Alice moves first, then Alice and Bob alternate appending 'X' or 'O'.
//   - Alice wins as soon as the string contains ALICE_COUNT (2) pairwise
//     disjoint substrings of length ALICE_LEN (5) that are identical to
//     each other (any pattern, not necessarily a single repeated letter).
//   - Bob wins as soon as the string contains BOB_COUNT (4) pairwise
//     disjoint substrings of length BOB_LEN (3) that are all identical to
//     each other (one pattern occurring 4+ times, disjointly).
//   - If a single move makes both true for the first time simultaneously,
//     it's a draw.

export const ALICE_LEN = 5;
export const ALICE_COUNT = 2;
export const BOB_LEN = 3;
export const BOB_COUNT = 4;

export type Winner = "A" | "B" | "Draw" | null;

export interface SimResult {
  winner: Winner;
  length: number;
}

/** Replay a full string of moves; returns the winner and the move count at
 * which the game ended (or moves.length if it never ended within the given
 * string). */
export function simulate(moves: string): SimResult {
  const claims5 = new Map<string, number>(); // pattern -> end position (1-indexed)
  const claims3 = new Map<string, [number, number]>(); // pattern -> [count, end]
  let tail = "";

  for (let i = 0; i < moves.length; i++) {
    const c = moves[i];
    const pos = i + 1; // 1-indexed length after this move
    const tailFull = tail + c;
    let alice = false;
    let bob = false;

    if (pos >= ALICE_LEN) {
      const w = tailFull.slice(-ALICE_LEN);
      const start = pos - ALICE_LEN + 1;
      const prevEnd = claims5.get(w) ?? 0;
      if (start > prevEnd) {
        if (claims5.has(w)) alice = true;
        claims5.set(w, pos);
      }
    }

    if (pos >= BOB_LEN) {
      const w = tailFull.slice(-BOB_LEN);
      const start = pos - BOB_LEN + 1;
      const [cnt, prevEnd] = claims3.get(w) ?? [0, 0];
      if (start > prevEnd) {
        const newCnt = cnt + 1;
        claims3.set(w, [newCnt, pos]);
        if (newCnt >= BOB_COUNT) bob = true;
      }
    }

    tail = tailFull.slice(-(Math.max(ALICE_LEN, BOB_LEN) - 1));

    if (alice && bob) return { winner: "Draw", length: pos };
    if (alice) return { winner: "A", length: pos };
    if (bob) return { winner: "B", length: pos };
  }

  return { winner: null, length: moves.length };
}

/** Which disjoint blocks actually won the game, for highlighting on the
 * board. Only meaningful once simulate(moves).winner !== null. Returns the
 * 0-indexed [start, end) ranges of the winning blocks. */
export function winningBlocks(moves: string): { ranges: [number, number][]; kind: "A" | "B" | "Draw" } | null {
  const { winner, length } = simulate(moves);
  if (winner === null) return null;
  const prefix = moves.slice(0, length);

  function findDisjointRanges(len: number, count: number): [number, number][] {
    const lastEnd = new Map<string, number>();
    const occurrencesByPattern = new Map<string, [number, number][]>();
    for (let i = len; i <= prefix.length; i++) {
      const w = prefix.slice(i - len, i);
      const start = i - len + 1;
      const prevEnd = lastEnd.get(w) ?? 0;
      if (start > prevEnd) {
        lastEnd.set(w, i);
        const arr = occurrencesByPattern.get(w) ?? [];
        arr.push([i - len, i]);
        occurrencesByPattern.set(w, arr);
      }
    }
    for (const [, ranges] of occurrencesByPattern) {
      if (ranges.length >= count) return ranges.slice(0, count);
    }
    return [];
  }

  if (winner === "A" || winner === "Draw") {
    const a = findDisjointRanges(ALICE_LEN, ALICE_COUNT);
    if (winner === "A") return { ranges: a, kind: "A" };
  }
  if (winner === "B" || winner === "Draw") {
    const b = findDisjointRanges(BOB_LEN, BOB_COUNT);
    if (winner === "B") return { ranges: b, kind: "B" };
  }
  // Draw: return both sets concatenated, caller distinguishes by length.
  const a = findDisjointRanges(ALICE_LEN, ALICE_COUNT);
  const b = findDisjointRanges(BOB_LEN, BOB_COUNT);
  return { ranges: [...a, ...b], kind: "Draw" };
}

export function turnOf(moveIndex1Based: number): "A" | "B" {
  return moveIndex1Based % 2 === 1 ? "A" : "B";
}
