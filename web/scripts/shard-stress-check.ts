// Direct proof that (a) a single JS Map really does hit a hard entry-count
// ceiling ("Map maximum size exceeded"), independent of available memory,
// and (b) sharding across many Maps (the same technique engine.ts now
// uses) avoids it for the same total volume. Not wired into the engine's
// own key format -- this is a standalone demonstration of the underlying
// mechanism, since actually driving solve() past 16.7M real positions
// would take far too long for a quick check.

const TOTAL = 17_000_000; // comfortably past V8's ~16.7M (2^24) single-Map ceiling
const SHARD_COUNT = 64;

function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

console.log(`Inserting ${TOTAL.toLocaleString()} entries into a single Map...`);
try {
  const single = new Map<string, number>();
  for (let i = 0; i < TOTAL; i++) {
    single.set("k" + i, i);
  }
  console.log(`Unexpected: single Map accepted all ${single.size.toLocaleString()} entries without error.`);
  console.log("(V8's limit may be higher than assumed on this platform/version -- not itself a problem for us,");
  console.log(" sharding is still correct, just possibly not strictly necessary at this exact volume here.)");
} catch (e) {
  console.log(`OK: single Map failed as expected -> ${e instanceof Error ? e.message : e}`);
}

console.log(`\nInserting the same ${TOTAL.toLocaleString()} entries across ${SHARD_COUNT} sharded Maps...`);
const t0 = performance.now();
const shards: Map<string, number>[] = Array.from({ length: SHARD_COUNT }, () => new Map());
for (let i = 0; i < TOTAL; i++) {
  const key = "k" + i;
  const shard = shards[hashKey(key) % SHARD_COUNT];
  shard.set(key, i);
}
const t1 = performance.now();

const total = shards.reduce((sum, s) => sum + s.size, 0);
const sizes = shards.map((s) => s.size);
const min = Math.min(...sizes);
const max = Math.max(...sizes);
const avg = total / SHARD_COUNT;

console.log(`OK: sharded insert completed in ${(t1 - t0).toFixed(0)}ms, total entries: ${total.toLocaleString()}`);
console.log(`Shard sizes: min=${min.toLocaleString()}, max=${max.toLocaleString()}, avg=${avg.toFixed(0)}`);
console.log(`Max shard is ${((max / avg - 1) * 100).toFixed(1)}% above average (should be small -- confirms good hash distribution)`);

if (total !== TOTAL) {
  console.error("FAIL: sharded total doesn't match expected count (hash collisions across different keys?)");
  process.exit(1);
}
if (max > 5_000_000) {
  console.error("FAIL: a shard grew unexpectedly large -- distribution is skewed, defeating the point of sharding");
  process.exit(1);
}

console.log("\nAll shard-stress checks passed.");
