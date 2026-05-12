#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function buildErrorEntry({
  task,
  didNotWork,
  worked,
  note,
  repo = "commerce",
}) {
  const today = new Date().toISOString().slice(0, 10);
  return `\n## ${today} — ${task}\n\nRepo: \`${repo}\`\n\n**What did not work:** ${didNotWork.trim()}\n\n**What worked:** ${worked.trim()}\n\n**Note for next time:** ${note.trim()}\n`;
}

export function appendErrorEntry(path, entry) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, "# Agent Ops Errors\n", "utf8");
  appendFileSync(path, entry, "utf8");
}

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(argv) {
  const task = valueAfter(argv, "--task");
  const didNotWork = valueAfter(argv, "--did-not-work");
  const worked = valueAfter(argv, "--worked");
  const note = valueAfter(argv, "--note");
  const path = valueAfter(argv, "--path") || "docs/agent-ops/ERRORS.md";
  if (!task || !didNotWork || !worked || !note) {
    console.error(
      "Usage: node scripts/agent_ops/preserve-error.mjs --task <task> --did-not-work <text> --worked <text> --note <text>",
    );
    return 2;
  }
  appendErrorEntry(path, buildErrorEntry({ task, didNotWork, worked, note }));
  console.log(`Appended error entry to ${path}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
