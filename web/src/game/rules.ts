// Core rules for the XO game, as a simple string-based reference
// implementation. This mirrors ../../../rules.py (generalized) and is used
// by the UI for display/history bookkeeping and as a slow-but-obviously-
// correct reference against the fast packed-state engine in engine.ts.
//
// Alice moves first, then Alice and Bob alternate appending 'X' or 'O'.
//   - Alice wins as soon as the string contains `aliceCount` pairwise
//     disjoint substrings of length `aliceLen` that are identical to each
//     other (any pattern, not necessarily a single repeated letter).
//   - Bob wins as soon as the string contains `bobCount` pairwise disjoint
//     substrings of length `bobLen` that are all identical to each other.
//   - If a single move makes both true for the first time simultaneously,
//     it's a draw.
//
// The classic ruleset is aliceLen=5, aliceCount=2, bobLen=3, bobCount=4.

import type { RuleConfig } from "./engine";
export { CLASSIC_RULES } from "./engine";
export type { RuleConfig } from "./engine";

export type Winner = "A" | "B" | "Draw" | null;

export interface SimResult {
  winner: Winner;
  length: number;
}

/** Replay a full string of moves; returns the winner and the move count at
 * which the game ended (or moves.length if it never ended within the given
 * string). */
export function simulate(moves: string, cfg: RuleConfig): SimResult {
  const claimsACount = new Map<string, number>();
  const claimsAEnd = new Map<string, number>();
  const claimsBCount = new Map<string, number>();
  const claimsBEnd = new Map<string, number>();
  let tail = "";
  const tailKeep = Math.max(cfg.aliceLen, cfg.bobLen) - 1;

  for (let i = 0; i < moves.length; i++) {
    const c = moves[i];
    const pos = i + 1;
    const tailFull = tail + c;
    let alice = false;
    let bob = false;

    if (pos >= cfg.aliceLen) {
      const w = tailFull.slice(-cfg.aliceLen);
      const start = pos - cfg.aliceLen + 1;
      const prevEnd = claimsAEnd.get(w) ?? 0;
      if (start > prevEnd) {
        const newCnt = (claimsACount.get(w) ?? 0) + 1;
        claimsACount.set(w, newCnt);
        claimsAEnd.set(w, pos);
        if (newCnt >= cfg.aliceCount) alice = true;
      }
    }

    if (pos >= cfg.bobLen) {
      const w = tailFull.slice(-cfg.bobLen);
      const start = pos - cfg.bobLen + 1;
      const prevEnd = claimsBEnd.get(w) ?? 0;
      if (start > prevEnd) {
        const newCnt = (claimsBCount.get(w) ?? 0) + 1;
        claimsBCount.set(w, newCnt);
        claimsBEnd.set(w, pos);
        if (newCnt >= cfg.bobCount) bob = true;
      }
    }

    tail = tailFull.slice(-tailKeep);

    if (alice && bob) return { winner: "Draw", length: pos };
    if (alice) return { winner: "A", length: pos };
    if (bob) return { winner: "B", length: pos };
  }

  return { winner: null, length: moves.length };
}

/** Which disjoint blocks actually won the game, for highlighting on the
 * board. Only meaningful once simulate(moves, cfg).winner !== null. Returns
 * the 0-indexed [start, end) ranges of the winning blocks. */
export function winningBlocks(
  moves: string,
  cfg: RuleConfig,
): { ranges: [number, number][]; kind: "A" | "B" | "Draw" } | null {
  const { winner, length } = simulate(moves, cfg);
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
    const a = findDisjointRanges(cfg.aliceLen, cfg.aliceCount);
    if (winner === "A") return { ranges: a, kind: "A" };
  }
  if (winner === "B" || winner === "Draw") {
    const b = findDisjointRanges(cfg.bobLen, cfg.bobCount);
    if (winner === "B") return { ranges: b, kind: "B" };
  }
  const a = findDisjointRanges(cfg.aliceLen, cfg.aliceCount);
  const b = findDisjointRanges(cfg.bobLen, cfg.bobCount);
  return { ranges: [...a, ...b], kind: "Draw" };
}

export function turnOf(moveIndex1Based: number): "A" | "B" {
  return moveIndex1Based % 2 === 1 ? "A" : "B";
}
