"""Independent sanity check for the *minimax logic* in solver.py (as opposed
to test_solver.py, which checks the solver's claimed result against the
rules -- this checks that the optimal-play *decision making* itself, i.e.
"win fast / prolong a forced loss / handle simultaneous draws", is correct).

Approach: solve a much smaller toy game (small enough for a completely
naive, unoptimized brute-force minimax operating directly on strings, with
no gap-capping or memoization tricks) two different ways, and confirm they
agree. If solver.py's memoized/reduced-state approach has a subtle bug, it
would very likely also show up here on the toy parameters.

Run with: python test_minimax_logic.py
"""

import itertools
import rules
import solver


def naive_solve(alice_len, alice_count, bob_len, bob_count, max_len=60):
    """Completely naive brute-force minimax, directly on strings, no state
    reduction whatsoever -- just recursion + memoization on the literal
    string built so far. Independent implementation from solver.py."""

    def check(s):
        a = rules.max_disjoint_repeat_count(s, alice_len) >= alice_count
        b = rules.max_disjoint_repeat_count(s, bob_len) >= bob_count
        if a and b:
            return "Draw"
        if a:
            return "A"
        if b:
            return "B"
        return None

    memo = {}

    def rank(turn, result):
        if result == turn:
            return 2
        if result == "Draw":
            return 1
        return 0

    def better(turn, a, b):
        ra, la = a
        rb, lb = b
        xa, xb = rank(turn, ra), rank(turn, rb)
        if xa != xb:
            return xa > xb
        if ra == turn:
            return la < lb
        if ra == "Draw":
            return la < lb
        return la > lb

    def rec(s, turn):
        if s in memo:
            return memo[s]
        if len(s) >= max_len:
            # Shouldn't happen for these toy parameters within max_len, but
            # guard against runaway recursion during test development.
            raise RuntimeError(f"hit max_len without termination: {s!r}")
        best = None
        for c in ("X", "O"):
            s2 = s + c
            result = check(s2)
            if result is not None:
                val = (result, 1)
            else:
                other = "B" if turn == "A" else "A"
                r, l = rec(s2, other)
                val = (r, 1 + l)
            if best is None or better(turn, val, best):
                best = val
        memo[s] = best
        return best

    return rec("", "A")


def test_toy_parameters_agree():
    cases = [
        (3, 2, 2, 2),  # Alice: 2 disjoint identical 3-blocks; Bob: 2 disjoint identical 2-blocks
        (2, 2, 2, 3),  # Alice: 2 disjoint identical 2-blocks; Bob: 3 disjoint identical 2-blocks
        (3, 2, 3, 2),  # symmetric small case
        (4, 2, 2, 2),
    ]
    for alice_len, alice_count, bob_len, bob_count in cases:
        # naive reference
        naive_result, naive_len = naive_solve(alice_len, alice_count, bob_len, bob_count)

        # solver.py's approach, retargeted at the same toy parameters
        rules.ALICE_LEN, rules.ALICE_COUNT = alice_len, alice_count
        rules.BOB_LEN, rules.BOB_COUNT = bob_len, bob_count
        rules._TAIL_KEEP = max(alice_len, bob_len) - 1
        solver.ALICE_LEN, solver.BOB_LEN = alice_len, bob_len
        solver._memo.clear()
        fast_result, fast_len, fast_moves = solver.solve_game()

        assert naive_result == fast_result, (
            (alice_len, alice_count, bob_len, bob_count), naive_result, fast_result
        )
        assert naive_len == fast_len, (
            (alice_len, alice_count, bob_len, bob_count), naive_len, fast_len
        )
        print(
            f"  ALICE({alice_len},{alice_count}) BOB({bob_len},{bob_count}): "
            f"both agree -> {fast_result} in {fast_len} moves ({fast_moves})"
        )

    print("test_toy_parameters_agree: OK")


if __name__ == "__main__":
    test_toy_parameters_agree()
    print("All minimax-logic tests passed.")
