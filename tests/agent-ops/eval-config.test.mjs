import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

const evals = JSON.parse(
  readFileSync("agent-skills/commerce-agent-ops/evals/evals.json", "utf8"),
);

test("commerce evals use agent-skills-eval shape", () => {
  assert.equal(evals.skill_name, "commerce-agent-ops");
  assert.ok(evals.evals.length >= 3);
  for (const item of evals.evals) {
    assert.ok(item.id);
    assert.ok(item.name);
    assert.ok(item.prompt);
    assert.ok(item.expected_output);
    assert.ok(Array.isArray(item.assertions));
    assert.ok(item.assertions.length > 0);
    assert.ok(["optimization", "holdout"].includes(item.split));
    assert.ok(Array.isArray(item.tags));
    assert.ok(item.tags.length > 0);
  }
});

test("commerce skill eval yaml declares npx workspace and baseline", () => {
  const config = readFileSync("agent-skills-eval.yaml", "utf8");

  assert.match(config, /root: \.\/agent-skills/);
  assert.match(config, /workspace: \.\/\.agent-runs\/agent-skills-eval/);
  assert.match(config, /baseline: true/);
  assert.match(config, /apiKeyEnv: OPENAI_API_KEY/);
  assert.match(config, /commerce-agent-ops/);
});

test("commerce eval runner dry-run prints safe command", () => {
  const output = execFileSync(
    "node",
    [
      "scripts/agent_ops/run-skill-evals.mjs",
      "--dry-run",
      "--split",
      "optimization",
    ],
    {
      encoding: "utf8",
    },
  );

  assert.match(output, /npx agent-skills-eval/);
  assert.match(output, /--config agent-skills-eval.yaml/);
  assert.match(output, /OPENAI_API_KEY/);
  assert.match(output, /\.agent-runs\/agent-skills-eval/);
});
