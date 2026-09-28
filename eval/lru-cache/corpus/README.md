# Judgment corpus

Diffs used to calibrate spec_gates / spec_perf against the live Jev backend.
Names ending `-gamed`/`regression-` are deliberate true-positives; `clean`,
`honest`, `optimization` are true-negatives. `findings-*.md` record the runs.

Cumulative (n=13 gates, n=2 perf): TP 3/3 / 1/1, TN 10/10 / 1/1, FP 0, FN 0.
Grow toward n>=30 before any promotion from advisory.
