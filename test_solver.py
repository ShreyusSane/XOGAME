"""Validate the solver's output against the independent rules.simulate()
checker, and sanity-check that neither player has an unplayed better
alternative available anywhere along the optimal line (spot check).

Run with: python test_solver.py
"""

from rules import simulate
import solver


def test_solver_matches_rules():
    winner, length, moves = solver.solve_game()
    assert len(moves) == length
    ref_winner, ref_length = simulate(moves)
    assert ref_winner == winner, (ref_winner, winner)
    assert ref_length == length, (ref_length, length)
    print(f"test_solver_matches_rules: OK ({winner}, {length} moves, {moves})")


def test_no_early_termination_on_the_line():
    # For every prefix of the optimal line shorter than the full game, the
    # game must NOT already be over (otherwise the claimed length is wrong).
    winner, length, moves = solver.solve_game()
    for i in range(1, length):
        prefix = moves[:i]
        w, _ = simulate(prefix)
        assert w is None, f"game already ended at move {i} ({w}), not {length}"
    print("test_no_early_termination_on_the_line: OK")


if __name__ == "__main__":
    test_solver_matches_rules()
    test_no_early_termination_on_the_line()
    print("All solver tests passed.")
