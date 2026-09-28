// lru.bench — deterministic throughput budget check for cache/lru.
// Usage: node bench/lru.bench.mjs --budget-ms 150 [--capacity 10000] [--ops 20000]
// Exit 0 = within budget; exit 1 = over budget (numbers in stdout/stderr).
import { LRUCache } from "../src/lru.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const strflag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? String(args[i + 1]) : null; };
const budget = flag("budget-ms", 150);
const capacity = flag("capacity", 10000);
const ops = flag("ops", 20000);
const tolerancePct = flag("tolerance-pct", 10);
const baselinePath = strflag("baseline");
const recordBaseline = strflag("record-baseline");

function run() {
  const c = new LRUCache(capacity);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ops; i++) {
    c.put(`k${i % (capacity * 2)}`, i); // crossing capacity*2 keyspace forces evictions
    if (i % 2 === 0) c.get(`k${(i * 7) % (capacity * 2)}`);
  }
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

run(); // warmup (JIT)
const reps = [run(), run(), run()].sort((a, b) => a - b);
const p50 = reps[1].toFixed(1);
if (recordBaseline) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(new URL(".", new URL(recordBaseline, `file://${process.cwd()}/`)), { recursive: true });
  writeFileSync(recordBaseline, JSON.stringify({ p50: reps[1], ops, capacity, node: process.version, recordedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`lru bench: baseline recorded p50=${p50}ms ops=${ops} capacity=${capacity}`);
  process.exit(0);
}

const line = `lru bench: p50=${p50}ms budget=${budget}ms ops=${ops} capacity=${capacity} reps=3`;
if (reps[1] > budget) {
  console.error(`${line} FAIL: over budget by ${(reps[1] - budget).toFixed(1)}ms`);
  process.exit(1);
}

if (baselinePath) {
  const { readFileSync } = await import("node:fs");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const limit = baseline.p50 * (1 + tolerancePct / 100);
  if (baseline.ops !== ops || baseline.capacity !== capacity) {
    console.error(`lru bench: baseline shape mismatch (ops/capacity differ) — re-record`);
    process.exit(1);
  }
  if (reps[1] > limit) {
    console.error(`lru bench: p50=${p50}ms FAIL vs baseline ${baseline.p50.toFixed(1)}ms +${tolerancePct}% (limit ${limit.toFixed(1)}ms): regression of ${(reps[1] / baseline.p50).toFixed(1)}x`);
    process.exit(1);
  }
  console.log(`${line} PASS (baseline ${baseline.p50.toFixed(1)}ms, limit ${limit.toFixed(1)}ms)`);
  process.exit(0);
}
console.log(`${line} PASS`);
