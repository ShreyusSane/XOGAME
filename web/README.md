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
Changing them re-solves that exact ruleset from scratch. The search's
"max positions" cutoff is also a setup-screen input (defaults to 4.5M,
clamped to [10K, 100M]), and the solve shows a live progress bar and
`positions explored / max` counter while it runs, then the final
`positions covered / max` in the in-game header once done.

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
  - `MAX_BLOCK_LEN`, `MAX_COUNT`, `MAX_STATES_HARD_CAP`, `MAX_MOVE_LENGTH`
    are hard safety caps independent of whatever the UI enforces.
    `maxStates` (the "max positions" search cutoff) *is* user-configurable
    per `RuleConfig` — but always clamped into
    `[MIN_MAX_STATES, MAX_STATES_HARD_CAP]` in `configure()`, so a typo or
    a reckless value can't crash the tab. Bigger rulesets don't just need
    more *states* — the number of simultaneously-active patterns (and so
    each key's size) can also grow with game length, so `MAX_MOVE_LENGTH`
    matters as much as the states cap for bounding worst-case memory.
    `TooComplexError` is what a config that blows past any of these
    surfaces as, all the way up to the UI, instead of hanging the tab.
  - `setProgressCallback()` lets the worker report the position count back
    to the main thread every `PROGRESS_INTERVAL` (25K) newly-memoized
    positions, *during* the otherwise-blocking synchronous `solve()` call —
    that's what drives the live progress bar. It's called from inside
    `solve()` right after inserting the new entry, so counts are exact (no
    double-reporting from nested calls observing a stale count before it's
    actually grown).
  - The memo is **sharded** across `SHARD_COUNT` (64) separate `Map`
    instances, routed by an FNV-1a hash of the key, instead of one big
    `Map`. This isn't an optimization — it's required for correctness at
    scale: a single JS `Map` throws a `RangeError` ("Map maximum size
    exceeded") once it holds more than V8's internal per-Map ceiling
    (~2^24, ~16.7M entries), regardless of how much memory is actually
    available. That's an *engine* limit, not a memory one, so raising
    `maxStates` alone doesn't help past it — `MAX_STATES_HARD_CAP` (100M)
    only became meaningful once sharding was in place. See
    `scripts/shard-stress-check.ts`, which directly reproduces the single-
    Map failure and confirms sharding avoids it at the same volume with
    near-perfect distribution across shards.
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
npx tsx scripts/benchmark.ts     # solves classic + a couple of custom rulesets, cross-checks against rules.ts
npx tsx scripts/safety-check.ts  # confirms invalid/oversized rulesets fail gracefully, not via OOM/hang
npx tsx scripts/maxstates-check.ts   # confirms the maxStates override and progress callback both work
npx tsx scripts/shard-stress-check.ts  # proves a single Map hits "Map maximum size exceeded" and sharding avoids it
```

## Deployment

`.github/workflows/deploy.yml` at the repo root builds this app and
deploys `web/dist` to GitHub Pages on every push to `main`. `vite.config.ts`
sets `base: '/XOGAME/'` to match a project-pages URL
(`https://<user>.github.io/XOGAME/`).
