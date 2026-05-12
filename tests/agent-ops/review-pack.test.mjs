import assert from "node:assert/strict";
import test from "node:test";

import { renderReviewPack } from "../../scripts/agent_ops/review-pack.mjs";

test("review pack groups commerce agent ops files", () => {
  const rendered = renderReviewPack({
    changedFiles: [
      "AGENTS.md",
      "scripts/agent_ops/context-loader.mjs",
      "tests/agent-ops/context-loader.test.mjs",
      "docs/agent-ops/CONTEXT_LOADING.md"
    ],
    diffStat: "4 files changed",
    qualityCommands: ["node --test tests/agent-ops/*.test.mjs"],
    baselineNotes: ["pnpm is unavailable in this shell"]
  });

  assert.match(rendered, /agent contracts\/docs/);
  assert.match(rendered, /agent ops scripts/);
  assert.match(rendered, /Merge guidance/);
  assert.match(rendered, /pnpm is unavailable/);
});

test("review pack blocks empty merges", () => {
  const rendered = renderReviewPack({ changedFiles: [], diffStat: "", qualityCommands: [] });

  assert.match(rendered, /No changed files detected/);
  assert.match(rendered, /Do not merge/);
});
