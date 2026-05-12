import assert from "node:assert/strict";
import test from "node:test";

import { getContextForTask, renderContext } from "../../scripts/agent_ops/context-loader.mjs";

test("commerce context loader combines universal and task context", () => {
  const context = getContextForTask("agent-ops");

  assert.ok(context.load.includes("AGENTS.md"));
  assert.ok(context.load.includes("CLAUDE.md"));
  assert.ok(context.load.includes("docs/agent-ops/AGENT_OPERATING_PROTOCOL.md"));
  assert.ok(context.verify.some((command) => command.includes("node --test")));
});

test("commerce context loader fails loudly on unknown task", () => {
  assert.throws(() => getContextForTask("unknown"), /Unknown task type/);
});

test("commerce storefront context warns about secrets and env files", () => {
  const rendered = renderContext("storefront");

  assert.match(rendered, /Do not read/);
  assert.match(rendered, /\.env/);
  assert.match(rendered, /app\/page\.tsx/);
});
