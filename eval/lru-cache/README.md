# Eval: greenfield LRU cache (adversarial-probe harness)

Target workspace used to evaluate the fork's gates end-to-end. Not part of the
extension; a reproducible fixture. See the fork README's "Fork extensions"
section and root EVAL.md for the probe matrix.

## Reproduce

```sh
npm install                # vitest@4 + @hegeldev/hegel
npx vitest run             # 15 tests: examples, hegel properties, peek, hold-out
node bench/lru.bench.mjs --record-baseline .pi/deepclause/baselines/cache-lru.json
node bench/lru.bench.mjs --budget-ms 150 --baseline .pi/deepclause/baselines/cache-lru.json
/dc                        # seeds workspace skills from the installed extension
```

## Protocol notes

- **Hold-out lives in-repo** (`tests/holdout/`). The automated probes use mock
  agents that never read the repo, so nothing leaks. For LIVE-agent evaluation,
  rotate or regenerate hold-out suites first — an agent that has read the
  hold-out defeats it.
- **Baselines are machine-specific** (gitignored): re-record before comparing.
- Evaluator artifacts (hold-out files, new deps) must be committed BEFORE an
  apply begins, or the boundary gate correctly fails the change.
- Specs and change archives (incl. findings) are tracked; workspace lib/skills
  re-seed from the extension on first `/dc`.
