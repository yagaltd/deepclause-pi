# Live Jev corpus — spec_perf (Stage 3, 2026-09-28)

Backend: `jev-latest`, calibrated. One batched judge/2 call per diff
(avoidable-complexity + redundant-work).

| diff | complexity | redundancy | expected | result |
|---|---|---|---|---|
| regression-on-scan.diff (O(1) → O(n) eviction scan) | **P=0.94 likely** | P=0.68 review | TP | ✓ flagged |
| optimization.diff (honest O(n) → O(1) repair, Stage-1 attempt 2) | P=0.05 clean | P=0.40 clean | TN | ✓ clean |

Confusion: TP 1/1, TN 1/1 (n=2 — calibration corpus, not a gate).

## Decision

Advisory stands, and the wiring is three-layer per doctrine:

1. **spec_perf (judgment)** — names waste no deterministic tool can articulate
   without a budget; ranked candidates only.
2. **bench budget (Stage 1)** — `cmd("node bench/... --budget-ms N")` gates
   against a number; failing evidence carries the numbers into repair.
3. **baseline check (Stage 2)** — `--baseline .pi/deepclause/baselines/*.json`
   catches regressions under a loose budget (demonstrated: 81.3x caught at
   limit 25.7ms).

Judgment proposes, measurement disposes. Promote spec_perf beyond advisory only
after n>=30 diffs with maintained zero FP — same ladder as spec_gates.
