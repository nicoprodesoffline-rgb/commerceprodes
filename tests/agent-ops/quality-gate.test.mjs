import assert from "node:assert/strict";
import test from "node:test";

import { buildQualityPlan } from "../../scripts/agent_ops/quality-gate.mjs";

test("storefront changes require build-oriented verification", () => {
  const plan = buildQualityPlan(["app/page.tsx", "components/product-image.tsx"]);

  assert.ok(plan.reasons.includes("storefront"));
  assert.ok(plan.commands.some((command) => command.includes("npm run build")));
});

test("agent ops changes require node agent-op tests", () => {
  const plan = buildQualityPlan(["scripts/agent_ops/context-loader.mjs", "AGENTS.md"]);

  assert.ok(plan.reasons.includes("agent-ops"));
  assert.ok(plan.commands.some((command) => command.includes("node --test tests/agent-ops/*.test.mjs")));
});

test("sql and data changes require explicit review pack fallback plus sql reason", () => {
  const plan = buildQualityPlan(["docs/sql-migrations/008-site-config.sql", "data/import-report.json"]);

  assert.ok(plan.reasons.includes("data-sql"));
  assert.ok(plan.commands.some((command) => command.includes("review-pack.mjs")));
});

test("unknown docs-only changes fall back to review pack", () => {
  const plan = buildQualityPlan(["docs/morning-report.md"]);

  assert.ok(plan.reasons.includes("fallback"));
  assert.deepEqual(plan.commands, ["node scripts/agent_ops/review-pack.mjs"]);
});
