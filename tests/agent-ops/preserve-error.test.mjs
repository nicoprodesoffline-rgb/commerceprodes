import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendErrorEntry,
  buildErrorEntry,
} from "../../scripts/agent_ops/preserve-error.mjs";

test("buildErrorEntry records failed and working approaches", () => {
  const entry = buildErrorEntry({
    task: "commerce skill eval setup",
    didNotWork: "Using only docs without eval cases.",
    worked: "Adding optimization and holdout examples.",
    note: "Keep evals runnable from the quality gate.",
    repo: "commerce",
  });

  assert.match(entry, /commerce skill eval setup/);
  assert.match(entry, /What did not work/);
  assert.match(entry, /What worked/);
  assert.match(entry, /commerce/);
});

test("appendErrorEntry creates ERRORS.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "commerce-errors-"));
  const path = join(dir, "ERRORS.md");
  try {
    appendErrorEntry(
      path,
      buildErrorEntry({
        task: "remote credential",
        didNotWork: "Keeping tokenized origin URL.",
        worked: "Replacing origin with a clean GitHub URL.",
        note: "Check git remote -v before pushing.",
        repo: "commerce",
      }),
    );

    const text = readFileSync(path, "utf8");
    assert.match(text, /# Agent Ops Errors/);
    assert.match(text, /remote credential/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
