"""
Core rules for the XO game.

Alice and Bob alternately append a character ('X' or 'O') to a single shared
string. Alice places character 1 (the first move), Bob places character 2,
and so on, alternating.

Winning conditions:
  - Alice wins as soon as the string contains ALICE_COUNT (2) pairwise
    disjoint (non-overlapping) substrings of length ALICE_LEN (5) that are
    identical to each other. The repeated pattern can be anything (e.g.
    "XOXOX" occurring twice) -- it does not have to be a single repeated
    letter like "XXXXX".
  - Bob wins as soon as the string contains BOB_COUNT (4) pairwise disjoint
    substrings of length BOB_LEN (3) that are all identical to each other
    (one 3-letter pattern occurring 4+ times, disjointly).

Both conditions are monotone: once true they stay true as the string grows.
The game ends the instant either condition first becomes true. If a single
move makes both conditions become true for the first time simultaneously,
the game is a draw.

`step` is the single incremental transition used both by the brute-force
`simulate` (for testing) and by the game-tree solver, so there is exactly
one implementation of the rules to keep them from drifting apart.
"""

ALICE_LEN = 5
ALICE_COUNT = 2
BOB_LEN = 3
BOB_COUNT = 4

_TAIL_KEEP = max(ALICE_LEN, BOB_LEN) - 1  # characters of history we must remember


def initial_state():
    """(tail, claims5, claims3, length).

    tail: last up to _TAIL_KEEP characters placed.
    claims5: pattern -> position (1-indexed) of the end of the last disjoint
        occurrence of that pattern claimed so far (patterns with 0 claims
        are simply absent).
    claims3: pattern -> (count_claimed, position of end of last claim).
    length: total characters placed so far.
    """
    return ("", {}, {}, 0)


def step(state, c):
    """Append character c ('X' or 'O') to state. Returns (new_state, result)
    where result is 'A' (Alice wins), 'B' (Bob wins), 'Draw', or None (game
    continues)."""
    tail, claims5, claims3, length = state
    new_length = length + 1
    tail_full = tail + c

    claims5 = dict(claims5)
    claims3 = dict(claims3)
    alice_win = False
    bob_win = False

    if new_length >= ALICE_LEN:
        w = tail_full[-ALICE_LEN:]
        start = new_length - ALICE_LEN + 1
        prev_end = claims5.get(w, 0)
        if start > prev_end:
            if w in claims5:
                alice_win = True  # this is the 2nd disjoint occurrence
            claims5[w] = new_length

    if new_length >= BOB_LEN:
        w = tail_full[-BOB_LEN:]
        start = new_length - BOB_LEN + 1
        cnt, prev_end = claims3.get(w, (0, 0))
        if start > prev_end:
            cnt += 1
            claims3[w] = (cnt, new_length)
            if cnt >= BOB_COUNT:
                bob_win = True

    new_tail = tail_full[-_TAIL_KEEP:]
    new_state = (new_tail, claims5, claims3, new_length)

    if alice_win and bob_win:
        result = "Draw"
    elif alice_win:
        result = "A"
    elif bob_win:
        result = "B"
    else:
        result = None

    return new_state, result


def simulate(moves):
    """Replay a full string of moves and return (winner, length_at_end).
    winner in {'A','B','Draw',None}; None means the game had not ended by
    the end of the given moves. length_at_end is the move count at which
    the game ended (or len(moves) if it never ended)."""
    state = initial_state()
    for i, c in enumerate(moves, start=1):
        state, result = step(state, c)
        if result is not None:
            return result, i
    return None, len(moves)


# ---------------------------------------------------------------------------
# Independent reference implementation, used only by tests to cross-check the
# incremental `step` logic above. This is a classic weighted-interval-
# scheduling DP, deliberately written without any code shared with `step`.
# ---------------------------------------------------------------------------

def max_disjoint_occurrences_of_pattern(s, pattern):
    """Max number of pairwise-disjoint occurrences of `pattern` in s, via DP."""
    k = len(pattern)
    n = len(s)
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i - 1]
        if i >= k and s[i - k:i] == pattern:
            dp[i] = max(dp[i], dp[i - k] + 1)
    return dp[n]


def max_disjoint_repeat_count(s, k):
    """Over every distinct length-k substring occurring in s, the largest
    max_disjoint_occurrences_of_pattern found. Reference/test-only."""
    n = len(s)
    if n < k:
        return 0
    patterns = {s[i:i + k] for i in range(n - k + 1)}
    return max((max_disjoint_occurrences_of_pattern(s, p) for p in patterns), default=0)


def reference_result(s):
    """Reference (non-incremental) winner check for a complete string s:
    scans every prefix and reports the first prefix length at which either
    condition becomes true, and who wins. Independent of `step`/`simulate`,
    used only for testing."""
    for i in range(1, len(s) + 1):
        prefix = s[:i]
        a = max_disjoint_repeat_count(prefix, ALICE_LEN) >= ALICE_COUNT
        b = max_disjoint_repeat_count(prefix, BOB_LEN) >= BOB_COUNT
        if a and b:
            return "Draw", i
        if a:
            return "A", i
        if b:
            return "B", i
    return None, len(s)
