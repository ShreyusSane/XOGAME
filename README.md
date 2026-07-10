# XO Game

**[Play it live](https://ShreyusSane.github.io/XOGAME/)** — an interactive
version where you can play against the solved bot as either Alice or Bob,
see the exact number of moves to a forced win/draw update live, and browse
the full game tree to study any line (not just the one actually played).

The repo has two parts:

- **[`web/`](web/)** — the interactive React/TypeScript app above. Same
  rules and same minimax logic as the Python solver below, reimplemented
  with a performance-focused packed-state engine (see
  [`web/README.md`](web/README.md)) so the whole game can be solved and
  explored live in the browser.
- **Python files at the repo root** — the original solver: a from-scratch
  proof that the game is solvable, with independent cross-checks at every
  layer (see below). This is the reference implementation the web app's TS
  engine was validated against.

## The rules

Alice and Bob build a single string one character at a time, alternating
turns, Alice first. Each turn a player appends `X` or `O`.

- **Alice wins** as soon as the string contains **2** pairwise disjoint
  (non-overlapping) length-**5** substrings that are identical to each
  other. The repeated pattern can be anything (e.g. `XOXOX` occurring
  twice) — it does not need to be a single repeated letter.
- **Bob wins** as soon as the string contains **4** pairwise disjoint
  length-**3** substrings that are all identical to each other (one
  3-letter pattern occurring 4+ times, disjointly).
- If a single move makes both conditions become true for the first time
  in the same instant, it's a **draw**.

Both win conditions depend only on the string itself, not on who placed
the deciding character — so a player can accidentally hand the *other*
player a win on their own move. Both players play to win, then to draw
rather than lose, and if losing is forced, to draw the game out as long
as possible; the winning player always takes the fastest forced win.

## Result

Under optimal play from both sides: **Alice wins in 20 moves.**

```
XXOOXXOOOXXXXXXXXOOX
```

Move by move (odd = Alice, even = Bob) — run `python solver.py` to
reproduce, or see `solution.txt` for a saved copy of the output.

## Files

- `rules.py` — the game rules: an incremental `step`/`simulate` checker
  used by the solver, plus an independent DP-based reference checker
  (`max_disjoint_repeat_count`, `reference_result`) used only by tests.
- `solver.py` — the game-tree solver. Full minimax over the game, with a
  memoization key reduced to (last 4 characters, which patterns have been
  claimed so far and how "safe" each claim is, whose turn) — see the
  module docstring and comments for why that reduction is valid.
- `test_rules.py` — validates the incremental rules checker against the
  independent DP reference, exhaustively on all strings up to length 13
  and on thousands of random longer strings.
- `test_solver.py` — validates the solver's claimed result against
  `rules.simulate()`, and checks the game truly doesn't end early anywhere
  along the claimed optimal line.
- `test_minimax_logic.py` — validates the minimax decision-making itself
  (win fast / prolong a forced loss / simultaneous-draw handling) against
  a completely separate, unoptimized brute-force minimax, on several small
  toy parameterizations of the same game (including one that produces a
  draw).

## Running it

```
python test_rules.py          # ~1s
python test_minimax_logic.py  # ~1s
python solver.py               # solves the real game, ~80s, prints the result
python test_solver.py          # re-solves + cross-checks, ~80s
```

The real game's search visits a few million states, so `solver.py` and
`test_solver.py` each take roughly a minute or two. `rules.py` and
`test_minimax_logic.py` are fast (toy parameters / no search).

## Notes on performance

The naive state (the whole string so far) would make this game tree
unbounded. The solver instead tracks, per already-seen pattern, how many
moves have passed since its last disjoint claim — but only up to the
pattern's own length, since a claim that old can *never* block a future
occurrence again. Capping those "gaps" is what keeps the memoized state
space finite (a few million states) instead of blowing up unboundedly with
search depth.
