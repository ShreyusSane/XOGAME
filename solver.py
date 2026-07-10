"""
Game-tree solver for the XO game defined in rules.py.

Alice moves first, then Alice and Bob alternate appending 'X' or 'O'.
Both play optimally under this priority order (for each player):
  1. Win, rather than draw or lose.
  2. Draw, rather than lose.
  3. Lose, if losing is forced.
Subject to that, among moves that are tied on the above:
  - If a move is heading toward *this player's own win*, prefer the one
    that wins fastest (fewest total moves).
  - If a move is heading toward *this player's own loss* (forced), prefer
    the one that prolongs the game longest (most total moves) -- "drawing
    it out" as long as possible.
  - If a move is heading toward a draw, prefer the fastest draw (arbitrary
    tie-break; the problem statement doesn't specify a preference here).

Note the win conditions in rules.py are properties of the *string*, not of
who placed the deciding character -- so a player can accidentally hand the
other player (or themselves, the opponent's condition) a win on their own
move. The solver accounts for this: it is a real, adversarial game, not
just "Alice tries to build her own pattern."

Because both win conditions are monotone and win thresholds are small
(2 disjoint length-5 repeats / 4 disjoint length-3 repeats), the game is
guaranteed to end quickly (a loose pigeonhole bound on Bob's condition
alone puts an upper bound around 75 moves), so the full game tree,
memoized on a reduced state, is solvable exactly.
"""

import sys
from rules import step, initial_state, ALICE_LEN, BOB_LEN

sys.setrecursionlimit(100_000)

_OTHER = {"A": "B", "B": "A"}


def _state_key(state, turn):
    """Canonical memoization key. Absolute move-count is dropped in favor of
    *gaps* (moves elapsed since each pattern's last claim), since a state's
    entire future evolution depends only on those gaps, not on the absolute
    length -- this lets equivalent states reached via different move orders
    or at different depths share one memo entry.

    Gaps are additionally capped at (pattern length - 1): once a claim is
    that old, it can *never* block a future occurrence of the same pattern
    again (any future window of that length starts strictly after it), so
    every gap beyond the cap behaves identically. Without this cap, gaps
    grow without bound as recursion depth increases and states essentially
    never get reused, which blew memory usage up into the gigabytes; with
    it, the reachable state space is small and finite.
    """
    tail, claims5, claims3, length = state
    c5 = tuple(
        sorted((p, min(length - end, ALICE_LEN - 1)) for p, end in claims5.items())
    )
    c3 = tuple(
        sorted(
            (p, cnt, min(length - end, BOB_LEN - 1))
            for p, (cnt, end) in claims3.items()
        )
    )
    return (tail, c5, c3, turn)


def _rank(turn, result):
    if result == turn:
        return 2  # this player wins
    if result == "Draw":
        return 1
    return 0  # the other player wins


def _better(turn, a, b):
    """True if outcome `a` = (result, length) is strictly preferred over `b`
    by `turn`, per the priority order described in the module docstring."""
    ra, la = a
    rb, lb = b
    xa, xb = _rank(turn, ra), _rank(turn, rb)
    if xa != xb:
        return xa > xb
    if ra == turn:
        return la < lb  # winning: faster is better
    if ra == "Draw":
        return la < lb  # draw: arbitrary tie-break, prefer faster
    return la > lb  # losing: prolong as long as possible


_memo = {}


def solve(state, turn):
    """Returns (result, remaining_length, best_move) for the sub-game
    starting at `state` with `turn` to move, where remaining_length is the
    number of further moves (from this state) until the game ends under
    optimal play by both sides."""
    key = _state_key(state, turn)
    cached = _memo.get(key)
    if cached is not None:
        return cached

    best_val = None
    best_move = None
    for c in ("X", "O"):
        new_state, result = step(state, c)
        if result is not None:
            val = (result, 1)
        else:
            sub_result, sub_len, _ = solve(new_state, _OTHER[turn])
            val = (sub_result, 1 + sub_len)
        if best_val is None or _better(turn, val, best_val):
            best_val = val
            best_move = c
        # Nothing beats "I win on this very move" -- short-circuit.
        if best_val == (turn, 1):
            break

    outcome = (best_val[0], best_val[1], best_move)
    _memo[key] = outcome
    return outcome


def solve_game():
    """Solve the full game from the start. Returns (winner, length, moves)
    where winner in {'A','B','Draw'}, length is the total number of moves
    played, and moves is the optimal-play string of 'X'/'O' characters."""
    state = initial_state()
    result, length, _ = solve(state, "A")

    # Reconstruct the actual optimal-play sequence by walking forward,
    # looking up the memoized best move at each state in turn.
    moves = []
    turn = "A"
    while True:
        key = _state_key(state, turn)
        _, _, move = _memo[key]
        state, res = step(state, move)
        moves.append(move)
        if res is not None:
            return res, len(moves), "".join(moves)
        turn = _OTHER[turn]


def describe(winner):
    return {"A": "Alice wins", "B": "Bob wins", "Draw": "Draw"}[winner]


if __name__ == "__main__":
    winner, length, moves = solve_game()
    print(f"Result under optimal play: {describe(winner)}")
    print(f"Game length: {length} moves")
    print(f"Move sequence: {moves}")
    print()
    print("Move-by-move (turn: char):")
    for i, c in enumerate(moves, start=1):
        who = "Alice" if i % 2 == 1 else "Bob"
        print(f"  {i:>3} {who:>5}: {c}")
    print()
    print(f"States explored (memo size): {len(_memo)}")
