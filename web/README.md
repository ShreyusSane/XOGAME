# XO Game — interactive web app

A React + TypeScript app to play the [XO game](../README.md) against a
perfect bot as either Alice or Bob, and to study it: a live evaluation of
the exact number of moves to a forced win/draw from any position, and an
expandable game-tree browser rooted at the start of the game (or the
current position), with the actually-played line auto-expanded and every
node's forced outcome shown.

The rules themselves are configurable from the setup screen: Alice's
target (`A` disjoint blocks of length `n`) and Bob's (`B` disjoint blocks
of length `m`) are plain number inputs, not just the classic A=2,n=5,B=4,m=3.
Changing them re-solves that exact ruleset from scratch.

## How it's built

- **`src/game/rules.ts`** — a plain string-based reference implementation
  of the rules (mirrors `../rules.py`, generalized to take a `RuleConfig`
  instead of fixed constants). Used for board bookkeeping, win-block
  highlighting, and as a slow-but-obviously-correct check against the fast
  engine.
- **`src/game/engine.ts`** — the actual solver, parametrized by
  `{aliceLen, aliceCount, bobLen, bobCount}`. Same minimax as
  `../solver.py` (win fastest / draw with a fastest tie-break / prolong a
  forced loss as long as possible), reworked for browser performance:
  claims are flat typed arrays (sized `2^aliceLen` / `2^bobLen`) instead of
  dict copies, and the game is advanced via in-place mutate + undo instead
  of allocating a new state per node. Solves the classic ruleset
  (~3.19M reachable states) in about 6–12s in V8, versus ~80s for the
  Python version — see `scripts/benchmark.ts`.

  Two things worth knowing if you touch this file:
  - Only *active* (ever-claimed) patterns are tracked, in two small arrays
    kept sorted by pattern index at all times (`insertSorted`/`removeValue`
    in `applyMove`/`undoMove`) — the memo key is built by walking those
    arrays directly. They **must** stay canonically ordered: two different
    move histories that reach the same underlying position have to produce
    the same key, or memoization silently stops sharing work and the
    search blows up exponentially (this exact bug, from iterating in
    claim/insertion order instead of sorted order, is what caused an
    OOM crash during generalization — caught by comparing memo size against
    the known-correct 3,192,848 for the classic ruleset).
  - The memo key is built from every active pattern on every single
    `solve()` call (millions of times), so key *string length* directly
    drives GC pressure — encode it as compactly as possible
    (`String.fromCharCode` packing, not human-readable separators).
  - `MAX_BLOCK_LEN`, `MAX_COUNT`, `MAX_STATES`, `MAX_MOVE_LENGTH` are hard
    safety caps independent of whatever the UI enforces. Bigger rulesets
    don't just need more *states* — the number of simultaneously-active
    patterns (and so each key's size) can also grow with game length, so
    `MAX_MOVE_LENGTH` matters as much as `MAX_STATES` for bounding
    worst-case memory. `TooComplexError` is what a config that blows past
    these surfaces as, all the way up to the UI, instead of hanging the tab.
- **`src/game/worker.ts`** / **`useEngine.ts`** — a `configure(rules)`
  message (re)builds the engine's arrays and solves the whole game once in
  a Web Worker (so the UI thread never blocks), then answers further
  queries near-instantly from its warm memo cache until reconfigured.
- **`src/components/`** — `SetupScreen` (pick a side and, optionally, the
  rules), `Board`, `EvaluationBanner` (live forced-outcome readout),
  `MoveControls` (optional hints on the move buttons), `GameTree` (the
  study view).

## Running locally

```
npm install
npm run dev                    # http://localhost:5173/XOGAME/
npm run build                  # production build to dist/
npx tsx scripts/benchmark.ts   # solves classic + a couple of custom rulesets, cross-checks against rules.ts
npx tsx scripts/safety-check.ts  # confirms invalid/oversized rulesets fail gracefully, not via OOM/hang
```

## Deployment

`.github/workflows/deploy.yml` at the repo root builds this app and
deploys `web/dist` to GitHub Pages on every push to `main`. `vite.config.ts`
sets `base: '/XOGAME/'` to match a project-pages URL
(`https://<user>.github.io/XOGAME/`).
