#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const validKinds = new Set([
  "decision",
  "failure-mode",
  "tool-verdict",
  "handoff",
  "checkpoint",
]);

export function buildEntry({ kind, title, body, repo = "commerce" }) {
  if (!validKinds.has(kind)) {
    throw new Error(
      `Unknown memory kind: ${kind}. Valid kinds: ${Array.from(validKinds).sort().join(", ")}`,
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return `\n## ${today} — ${title}\n\nKind: \`${kind}\`\n\nRepo: \`${repo}\`\n\n${body.trim()}\n`;
}

export function appendEntry(path, entry) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, "# Agent Ops Memory\n", "utf8");
  appendFileSync(path, entry, "utf8");
}

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(argv) {
  const kind = valueAfter(argv, "--kind");
  const title = valueAfter(argv, "--title");
  const body = valueAfter(argv, "--body");
  const path = valueAfter(argv, "--path") || "docs/agent-ops/MEMORY.md";
  if (!kind || !title || !body) {
    console.error(
      "Usage: node scripts/agent_ops/preserve-memory.mjs --kind decision --title <title> --body <body>",
    );
    return 2;
  }
  appendEntry(path, buildEntry({ kind, title, body }));
  console.log(`Appended memory entry to ${path}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
