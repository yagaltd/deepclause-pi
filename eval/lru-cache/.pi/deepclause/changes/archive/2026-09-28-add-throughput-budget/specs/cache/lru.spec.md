---
change: add-throughput-budget
---

# Spec Delta

## ADDED Requirements

### Requirement: Bounded operation cost
The cache SHALL meet a deterministic throughput budget at scale, so eviction cost stays effectively constant as capacity grows.

#### Scenario: Throughput at capacity stays within budget
- **WHEN** 20,000 mixed put/get operations run against a cache at capacity 10,000
- **THEN** the benchmark's median run completes within the change's declared millisecond budget and the check fails with the measured numbers when it does not
