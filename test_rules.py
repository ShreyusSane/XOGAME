"""Validation tests for rules.py.

Run with: python test_rules.py
"""

import random
import itertools

from rules import simulate, reference_result, ALICE_LEN, ALICE_COUNT, BOB_LEN, BOB_COUNT


def check(moves):
    got = simulate(moves)
    want = reference_result(moves)
    if got != want:
        raise AssertionError(
            f"mismatch for moves={moves!r}: simulate()={got} reference_result()={want}"
        )
    return got


def test_exhaustive_short_strings():
    # Exhaustively check every string up to a length where the game is
    # guaranteed to matter, cross-checking the fast incremental simulator
    # against the independent DP reference on every single one.
    n_checked = 0
    for length in range(0, 14):
        for bits in itertools.product("XO", repeat=length):
            s = "".join(bits)
            check(s)
            n_checked += 1
    print(f"test_exhaustive_short_strings: OK ({n_checked} strings up to length 13)")


def test_random_longer_strings():
    random.seed(42)
    n_checked = 0
    for _ in range(3000):
        length = random.randint(0, 40)
        # bias the alphabet sometimes so repeats/patterns show up more often
        if random.random() < 0.5:
            s = "".join(random.choice("XO") for _ in range(length))
        else:
            # biased / structured strings, more likely to trigger wins, to
            # exercise the interesting parts of the state space
            chunk = "".join(random.choice("XO") for _ in range(random.randint(1, 5)))
            s = (chunk * (length // len(chunk) + 1))[:length]
            s = "".join(
                (c if random.random() > 0.15 else random.choice("XO")) for c in s
            )
        check(s)
        n_checked += 1
    print(f"test_random_longer_strings: OK ({n_checked} random strings up to length 40)")


def test_known_examples():
    # "XOX" repeated 4 times looks Bob-shaped at a glance, but a length-5
    # window ("XOXXO") also ends up repeating disjointly one move earlier,
    # so Alice actually wins first -- exactly the kind of overlap that makes
    # hand-tracing unreliable here. check() confirms the incremental
    # simulator agrees with the independent DP reference, which is the
    # actual correctness guarantee (not this hand-picked example).
    s = "XOX" * 4
    result, length = check(s)
    assert result == "A", (result, length)
    assert length == 11, length

    # A pure run of 20 X's: sanity check it terminates and both the
    # incremental simulator and the independent reference agree (exact
    # winner/length are intentionally not hand-asserted here -- overlapping
    # windows make hand-tracing error prone; the exhaustive and random tests
    # are the real correctness net).
    s = "X" * 20
    result, length = check(s)
    assert result in ("A", "B", "Draw"), (result, length)
    print(f"  'X'*20 -> {result} at move {length}")

    print("test_known_examples: OK")


if __name__ == "__main__":
    test_exhaustive_short_strings()
    test_random_longer_strings()
    test_known_examples()
    print("All rules.py tests passed.")
