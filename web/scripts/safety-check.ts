import { configure, solveFromStart, TooComplexError } from "../src/game/engine";

function expectThrow(label: string, fn: () => void) {
  try {
    fn();
    console.error(`FAIL: ${label} did not throw`);
    process.exit(1);
  } catch (e) {
    if (e instanceof TooComplexError) {
      console.log(`OK: ${label} -> TooComplexError: ${e.message}`);
    } else {
      console.error(`FAIL: ${label} threw a non-TooComplexError:`, e);
      process.exit(1);
    }
  }
}

expectThrow("aliceLen=0", () => configure({ aliceLen: 0, aliceCount: 2, bobLen: 3, bobCount: 4 }));
expectThrow("aliceCount=-1", () => configure({ aliceLen: 5, aliceCount: -1, bobLen: 3, bobCount: 4 }));
expectThrow("aliceLen too big", () => configure({ aliceLen: 100, aliceCount: 2, bobLen: 3, bobCount: 4 }));
expectThrow("bobCount too big", () => configure({ aliceLen: 5, aliceCount: 2, bobLen: 3, bobCount: 100 }));

// A ruleset that passes input validation (both sides at the allowed max)
// but is deliberately hard to satisfy on both sides -- must hit the
// runtime MAX_MOVE_LENGTH/MAX_STATES guard and fail fast rather than
// hang/OOM the process.
expectThrow("max-allowed-but-hard ruleset", () => {
  configure({ aliceLen: 10, aliceCount: 8, bobLen: 10, bobCount: 8 });
  solveFromStart();
});

console.log("All safety checks passed.");
