import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createDeepClause } from "deepclause-sdk";
import { assembleTasksDml, validatePlanSpec, type PlanningSnapshot } from "../src/planner.js";

const SP_SOURCE = fileURLToPath(new URL("../src/assets/specs.dml", import.meta.url));
const APPLY_SOURCE = fileURLToPath(new URL("../src/assets/apply.dml", import.meta.url));
const SKILL_SOURCE = fileURLToPath(new URL("../src/assets/spec_apply.dml", import.meta.url));

const BOUNDARY_COMMAND = "git diff --name-only HEAD; git ls-files --others --exclude-standard";

const SNAPSHOT: PlanningSnapshot = {
  model: "test/model",
  thinkingLevel: "medium",
  activeTools: ["read"],
  allTools: [{ name: "read", description: "Read", parameters: { type: "object" }, sourceInfo: { source: "core" } } as never],
  skillNames: [],
  contextFiles: [],
  existingSkills: [],
  existingPlans: [],
};

function tasks(allowed: string[], target: string): string {
  return `plan_task("1.1", task{
    executor:  pi,
    do:        "Edit ${target}",
    tools:     ["read"],
    expected:  "edited",
    satisfies: [],
    allowed:   ${JSON.stringify(allowed).replace(/,/g, ", ")},
    checks:    []
}).

% --- execution state (managed by apply.dml; do not edit by hand) ---
plan_task_status("1.1", pending).
`;
}

/** Real git repo + deepclause workspace; the agent mock writes files, the verify
 *  mock shells out to REAL git in the repo, so the gate sees a genuine diff. */
async function repo(tasksDml: string): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "dc-boundary-"));
  const root = path.join(cwd, ".pi", "deepclause");
  await mkdir(path.join(root, "lib"), { recursive: true });
  await mkdir(path.join(root, "changes", "c"), { recursive: true });
  await mkdir(path.join(cwd, "src"), { recursive: true });
  await writeFile(path.join(root, "lib", "specs.dml"), await readFile(SP_SOURCE, "utf8"));
  await writeFile(path.join(root, "lib", "apply.dml"), await readFile(APPLY_SOURCE, "utf8"));
  await writeFile(path.join(root, "changes", "c", "tasks.dml"), tasksDml);
  await writeFile(path.join(cwd, "README.md"), "# baseline\n");
  const git = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  git(["add", "-A"]);
  git(["commit", "-qm", "baseline"]);
  return cwd;
}

interface RunOpts {
  /** files the mock agent writes on each attempt */
  writes: string[];
  /** override the verify mock (e.g. simulate git failure) */
  verify?: (command: string) => { stdout: string; stderr: string; exitCode: number };
}

async function apply(cwd: string, opts: RunOpts): Promise<{ answer: string; instructions: string[]; outputs: string[] }> {
  const skill = await readFile(SKILL_SOURCE, "utf8");
  const instructions: string[] = [];
  const outputs: string[] = [];
  const sdk = await createDeepClause({
    model: "boundary-test",
    llmBackend: { async complete() { return { text: "unused" }; } },
  });
  try {
    sdk.registerTool("pi_agent_step", {
      description: "stub delegated pi step",
      parameters: { type: "object", properties: { instruction: { type: "string" } }, required: ["instruction"] },
      execute: async (args) => {
        instructions.push(String(args.instruction));
        for (const file of opts.writes) {
          await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
          await writeFile(path.join(cwd, file), "changed\n");
        }
        return "done";
      },
    });
    sdk.registerTool("dc_verify_run", {
      description: "stub verification command (real git)",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: async (args) => {
        const command = String(args.command);
        if (opts.verify) {
          const r = opts.verify(command);
          return { command, ...r, killed: false };
        }
        if (command === BOUNDARY_COMMAND) {
          const r = spawnSync("bash", ["-c", command], { cwd, encoding: "utf8" });
          return { command, stdout: r.stdout ?? "", stderr: r.stderr ?? "", exitCode: r.status ?? 0, killed: false };
        }
        return { command, stdout: "", stderr: "", exitCode: 0, killed: false };
      },
    });
    sdk.setToolPolicy({ mode: "whitelist", tools: ["pi_agent_step", "dc_verify_run"] });

    const events = [];
    for await (const event of sdk.runDML(skill, { workspacePath: cwd, args: ["c", "apply"] })) {
      if (event.type === "output") outputs.push(String(event.content ?? ""));
      events.push(event);
    }
    return {
      answer: events.find((event) => event.type === "answer")?.content ?? "",
      instructions,
      outputs: outputs.map(String),
    };
  } finally {
    await sdk.dispose();
  }
}

describe("boundary gate", () => {
  it("adversarial probe: an out-of-bounds edit fails verification and feeds evidence into the retry", async () => {
    const cwd = await repo(tasks(["src/**"], "README.md"));
    const { answer, instructions } = await apply(cwd, { writes: ["README.md"] });
    expect(answer).toContain("apply c: 0/1 tasks verified");
    expect(answer).toContain("status: INCOMPLETE");
    expect(instructions.length).toBe(3); // 3 attempts (max), each fed the violation
    expect(instructions[1]! + instructions[2]!).toContain("boundary violation");
    expect(instructions[1]! + instructions[2]!).toContain("README.md");
    const updated = await readFile(path.join(cwd, ".pi", "deepclause", "changes", "c", "tasks.dml"), "utf8");
    expect(updated).toContain('plan_task_status("1.1", failed(4,');
  }, 30_000);

  it("in-bounds edits pass", async () => {
    const cwd = await repo(tasks(["src/**"], "src/feature.ts"));
    const { answer } = await apply(cwd, { writes: ["src/feature.ts"] });
    expect(answer).toContain("apply c: 1/1 tasks verified");
    expect(answer).toContain("status: OK");
  }, 30_000);

  it("the union of all task boundaries applies, and .pi/deepclause state is exempt", async () => {
    const tasksDml = `plan_task("1.1", task{
    executor:  pi,
    do:        "Edit docs and src",
    tools:     ["read"],
    expected:  "edited",
    satisfies: [],
    allowed:   ["src/**"],
    checks:    []
}).
plan_task("1.2", task{
    executor:  pi,
    do:        "Edit docs",
    tools:     ["read"],
    expected:  "edited",
    satisfies: [],
    allowed:   ["docs/**"],
    checks:    []
}).

% --- execution state (managed by apply.dml; do not edit by hand) ---
plan_task_status("1.1", pending).
plan_task_status("1.2", pending).
`;
    const cwd = await repo(tasksDml);
    // task 1 writes inside ITS OWN boundary plus task 2's boundary (union) — passes;
    // tasks.dml status rewrites under .pi/deepclause/ are exempt by construction.
    const { answer } = await apply(cwd, { writes: ["src/a.ts", "docs/b.md"] });
    expect(answer).toContain("apply c: 2/2 tasks verified");
    expect(answer).toContain("status: OK");
  }, 30_000);

  it("gate is inert when no task declares boundaries", async () => {
    const cwd = await repo(tasks([], "README.md"));
    const { answer, outputs } = await apply(cwd, { writes: ["README.md"] });
    expect(answer).toContain("status: OK");
    expect(outputs.join("\n")).not.toContain("boundary violation");
  }, 30_000);

  it("degrades loudly when the diff command fails, never blocking the task", async () => {
    const cwd = await repo(tasks(["src/**"], "src/x.ts"));
    const { answer, outputs } = await apply(cwd, {
      writes: ["src/x.ts"],
      verify: (command) =>
        command === BOUNDARY_COMMAND
          ? { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }
          : { stdout: "", stderr: "", exitCode: 0 },
    });
    expect(answer).toContain("status: OK");
    expect(outputs.join("\n")).toContain("boundary: git diff exited 128");
  }, 30_000);
});

describe("planner allowed support", () => {
  const base = {
    slug: "boundary_test",
    title: "Boundary test",
    objective: "Test boundaries.",
    assumptions: [],
    failureMessage: "failed",
    steps: [
      {
        id: "1.1",
        title: "Edit",
        instruction: "Edit the file.",
        executor: "pi",
        requiredTools: ["read"],
        relevantSkills: [],
        expectedResult: "edited",
        satisfies: [],
        checks: ["exists:src/a.ts"],
        allowed: ["src/**"],
      },
    ],
  };

  it("emits the allowed field into tasks.dml", () => {
    const plan = validatePlanSpec(base as never, SNAPSHOT, undefined, {});
    const dml = assembleTasksDml(plan, SNAPSHOT);
    expect(dml).toContain('allowed:   ["src/**"]');
  });

  it("accepts plans without allowed fields unchanged", () => {
    const spec = { ...base, steps: [{ ...base.steps[0]!, allowed: undefined }] };
    const plan = validatePlanSpec(spec as never, SNAPSHOT, undefined, {});
    const dml = assembleTasksDml(plan, SNAPSHOT);
    expect(dml).not.toContain("allowed:");
  });

  it("rejects absolute and parent-escaping patterns", () => {
    expect(() => validatePlanSpec({ ...base, steps: [{ ...base.steps[0]!, allowed: ["/etc/**"] }] } as never, SNAPSHOT, undefined, {})).toThrow(
      /allowed/,
    );
    expect(() => validatePlanSpec({ ...base, steps: [{ ...base.steps[0]!, allowed: ["../outside/**"] }] } as never, SNAPSHOT, undefined, {})).toThrow(
      /allowed/,
    );
  });
});
