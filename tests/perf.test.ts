import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDeepClause, createMockJevJudgeBackend, createMockJudgeBackend } from "deepclause-sdk";
import type { JudgeBackend } from "deepclause-sdk";
import { validateWithProlog } from "deepclause-sdk/compiler";

const SKILL_PATH = fileURLToPath(new URL("../src/assets/spec_perf.dml", import.meta.url));
const SLOW_DIFF = [
  "diff --git a/src/lru.js b/src/lru.js",
  "--- a/src/lru.js",
  "+++ b/src/lru.js",
  "@@ -10,6 +10,12 @@",
  "     if (this.map.size > this.capacity) {",
  "+      let eldest = null, min = Infinity;",
  "+      for (const [k] of this.map) {",
  "+        const s = this.stamp.get(k);",
  "+        if (s < min) { min = s; eldest = k; }",
  "+      }",
  "+      this.map.delete(eldest);",
  "     }",
].join("\n");

async function runWithBackend(backend: JudgeBackend, diff: string | null): Promise<string | undefined> {
  const skill = await readFile(SKILL_PATH, "utf8");
  let source = "<inline>";
  if (diff !== null) {
    source = ".tmp-spec-perf.diff";
    await writeFile(source, diff, "utf8");
  }
  const sdk = await createDeepClause({
    model: "mock-model",
    llmBackend: { async complete() { return { text: "unused" }; } },
    judgeBackends: { mock: backend },
    defaultJudge: "mock",
  });
  try {
    let answer: string | undefined;
    for await (const event of sdk.runDML(skill, { workspacePath: process.cwd(), args: [source] })) {
      if (event.type === "answer") answer = event.content;
      if (event.type === "error") throw new Error(String(event.content));
    }
    return answer;
  } finally {
    await sdk.dispose();
    if (diff !== null) await rm(source, { force: true });
  }
}

describe("spec_perf skill", () => {
  it("keeps the authoring doctrine: calibrated gate, batched judge, labeled fallback, measurement note", async () => {
    const skill = await readFile(SKILL_PATH, "utf8");
    expect(skill).toContain("require_judgment(calibrated");
    expect(skill).toContain("judge(Diff, [");
    expect(skill).toContain("probability(");
    expect(skill).toContain("verify(Diff,");
    expect(skill).toContain("(estimate)");
    expect(skill).toContain("measurement decides");
    expect(skill).toContain("% Mutating: false");
  });

  it("is valid DML", async () => {
    const validation = await validateWithProlog(await readFile(SKILL_PATH, "utf8"));
    expect(validation.valid).toBe(true);
  });

  it("reports calibrated probabilities on a calibrated backend", async () => {
    const answer = await runWithBackend(createMockJevJudgeBackend({ probability: 0.91 }), SLOW_DIFF);
    expect(answer).toContain("P=0.91");
    expect(answer).toContain("likely");
    expect(answer).toContain("backend: calibrated");
    expect(answer).toContain("bench budget or baseline check");
  });

  it("grades below-threshold probabilities as clean", async () => {
    const answer = await runWithBackend(createMockJevJudgeBackend({ probability: 0.3 }), SLOW_DIFF);
    expect(answer).toContain("P=0.30");
    expect(answer).toContain("clean");
  });

  it("falls back to labeled verify estimates when the backend is uncalibrated", async () => {
    const answer = await runWithBackend(createMockJudgeBackend({ probability: 0.9, choice: "last" }), SLOW_DIFF);
    expect(answer).toContain("(estimate)");
    expect(answer).toContain("backend: uncalibrated");
    expect(answer).not.toContain("P=");
  });

  it("reports an empty diff instead of judging nothing", async () => {
    const answer = await runWithBackend(createMockJevJudgeBackend({ probability: 0.42 }), null);
    expect(answer).toContain("empty diff");
  });
});
