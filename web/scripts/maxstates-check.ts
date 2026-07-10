import { configure, solveFromStart, setProgressCallback, currentMaxStates, TooComplexError, CLASSIC_RULES } from "../src/game/engine";

// 1. Lowering maxStates below what classic needs (3,192,848) should fail gracefully.
try {
  configure({ ...CLASSIC_RULES, maxStates: 1_000_000 });
  solveFromStart();
  console.error("FAIL: expected TooComplexError with maxStates=1,000,000");
  process.exit(1);
} catch (e) {
  if (e instanceof TooComplexError) {
    console.log("OK: lowered maxStates correctly rejected classic ruleset ->", e.message);
  } else {
    throw e;
  }
}

// 2. Raising maxStates above the classic requirement should let it solve fine,
//    and currentMaxStates() should reflect the requested (clamped) value.
let progressCalls = 0;
let lastProgress = 0;
setProgressCallback((count) => {
  progressCalls++;
  lastProgress = count;
});
configure({ ...CLASSIC_RULES, maxStates: 5_000_000 });
const root = solveFromStart();
setProgressCallback(null);
console.log("OK: raised maxStates ->", root, "effective cap:", currentMaxStates());
console.log("progress callback fired", progressCalls, "times, last count:", lastProgress);
if (progressCalls === 0) {
  console.error("FAIL: progress callback never fired");
  process.exit(1);
}
if (currentMaxStates() !== 5_000_000) {
  console.error("FAIL: currentMaxStates() should reflect the requested value");
  process.exit(1);
}

console.log("All maxStates checks passed.");
