# Proposal: add-throughput-budget

Stage 1 of the optimization loop: encode a deterministic performance budget as a
spec requirement enforced by a cmd() check. The driver's existing retry loop
becomes the optimization loop — a failed budget feeds measured numbers into the
repair instruction. Probe: a correct-but-O(n) eviction must fail the budget,
repair against the evidence, and land O(1).
