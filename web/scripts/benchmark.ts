import { solveFromStart, evaluate, memoSize } from "../src/game/engine";
import { simulate } from "../src/game/rules";

const t0 = performance.now();
const root = solveFromStart();
const t1 = performance.now();

console.log("root evaluation:", root);
console.log("time (ms):", (t1 - t0).toFixed(0));
console.log("memo size:", memoSize());

// Reconstruct the optimal line by repeatedly asking evaluate() for the best
// move at each prefix -- exercises the "query an arbitrary position" path,
// not just the cached root.
let moves = "";
while (true) {
  const sim = simulate(moves);
  if (sim.winner !== null) break;
  const ev = evaluate(moves);
  moves += ev.bestMove;
}
console.log("reconstructed optimal line:", moves, "length", moves.length);

const check = simulate(moves);
console.log("cross-check via simulate():", check);

if (check.winner !== root.result || check.length !== root.movesRemaining) {
  console.error("MISMATCH between engine and rules.simulate()!");
  process.exit(1);
}
console.log("OK: engine result matches rules.simulate()");

for (let i = 1; i < moves.length; i++) {
  const prefixSim = simulate(moves.slice(0, i));
  if (prefixSim.winner !== null) {
    console.error(`Game already ended at move ${i} (${prefixSim.winner}), not ${moves.length}!`);
    process.exit(1);
  }
}
console.log("OK: no early termination anywhere along the optimal line");
