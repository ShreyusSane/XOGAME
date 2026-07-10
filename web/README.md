# XO Game — interactive web app

A React + TypeScript app to play the [XO game](../README.md) against a
perfect bot as either Alice or Bob, and to study it: a live evaluation of
the exact number of moves to a forced win/draw from any position, and an
expandable game-tree browser rooted at the start of the game (or the
current position), with the actually-played line auto-expanded and every
node's forced outcome shown.

## How it's built

- **`src/game/rules.ts`** — a plain string-based reference implementation
  of the rules (mirrors `../rules.py` exactly). Used for board bookkeeping,
  win-block highlighting, and as a slow-but-obviously-correct check against
  the fast engine.
- **`src/game/engine.ts`** — the actual solver. Same minimax as
  `../solver.py` (win fastest / draw with a fastest tie-break / prolong a
  forced loss as long as possible), but reworked for browser performance:
  claims are flat typed arrays instead of dict copies, and the game is
  advanced via in-place mutate + undo instead of allocating a new state per
  node. Solves the full game (~3.19M reachable states) in about 6–12s in
  V8, versus ~80s for the Python version — see `scripts/benchmark.ts`.
- **`src/game/worker.ts`** / **`useEngine.ts`** — the solve runs once in a
  Web Worker on load (so the UI thread never blocks), then answers further
  queries near-instantly from its warm memo cache.
- **`src/components/`** — `SetupScreen` (pick a side), `Board`,
  `EvaluationBanner` (live forced-outcome readout), `MoveControls`
  (optional hints on the move buttons), `GameTree` (the study view).

## Running locally

```
npm install
npm run dev       # http://localhost:5173/XOGAME/
npm run build     # production build to dist/
npx tsx scripts/benchmark.ts   # solves from the start and cross-checks against rules.ts
```

## Deployment

`.github/workflows/deploy.yml` at the repo root builds this app and
deploys `web/dist` to GitHub Pages on every push to `main`. `vite.config.ts`
sets `base: '/XOGAME/'` to match a project-pages URL
(`https://<user>.github.io/XOGAME/`).
