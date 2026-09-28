import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDeepClause, createMockJevJudgeBackend, createMockJudgeBackend } from "deepclause-sdk";
import type { JudgeBackend } from "deepclause-sdk";
import { validateWithProlog } from "deepclause-sdk/compiler";

const SKILL_PATH = fileURLToPath(new URL("../src/assets/spec_gates.dml", import.meta.url));
const GAMED_DIFF = [
  "diff --git a/src/slugify.ts b/src/slugify.ts",
  "--- a/src/slugify.ts",
  "+++ b/src/slugify.ts",
  "@@ -1,3 +1,4 @@",
  " export function slugify(title: string): string {",
  '+    if (title === "salt & pepper") return "salt-and-pepper";',
  "     return title.toLowerCase().replace(/ /g, \"-\");",
  " }",
].join("\n");

async function runWithBackend(backend: JudgeBackend, diff: string | null): Promise<string | undefined> {
  const skill = await readFile(SKILL_PATH, "utf8");
  let source = "<inline>";
  if (diff !== null) {
    source = ".tmp-spec-gates.diff";
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

describe("spec_gates skill", () => {
  it("keeps the authoring doctrine: calibrated gate, batched judge, labeled fallback", async () => {
    const skill = await readFile(SKILL_PATH, "utf8");
    expect(skill).toContain("require_judgment(calibrated");
    expect(skill).toContain("judge(Diff, [");
    expect(skill).toContain("probability(");
    expect(skill).toContain("verify(Diff,");
    expect(skill).toContain("(estimate)");
    expect(skill).toContain("% Mutating: false");
  });

  it("is valid DML", async () => {
    const validation = await validateWithProlog(await readFile(SKILL_PATH, "utf8"));
    expect(validation.valid).toBe(true);
  });

  it("reports calibrated probabilities on a calibrated backend", async () => {
    const answer = await runWithBackend(createMockJevJudgeBackend({ probability: 0.93 }), GAMED_DIFF);
    expect(answer).toContain("P=0.93");
    expect(answer).toContain("likely");
    expect(answer).toContain("backend: calibrated");
  });

  it("grades below-threshold probabilities as clean", async () => {
    const answer = await runWithBackend(createMockJevJudgeBackend({ probability: 0.2 }), GAMED_DIFF);
    expect(answer).toContain("P=0.20");
    expect(answer).toContain("clean");
  });

  it("falls back to labeled verify estimates when the backend is uncalibrated", async () => {
    const answer = await runWithBackend(createMockJudgeBackend({ probability: 0.9, choice: "last" }), GAMED_DIFF);
    expect(answer).toContain("(estimate)");
    expect(answer).toContain("backend: uncalibrated");
    expect(answer).not.toContain("P=");
  });

  it("reports an empty diff instead of judging nothing", async () => {
    const answer = await runWithBackend(createMockJevJudgeBackend({ probability: 0.42 }), null);
    expect(answer).toContain("empty diff");
  });
});
