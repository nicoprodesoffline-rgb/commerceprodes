#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { getContextForTask } from "./context-loader.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function renderPreflight(taskType) {
  const context = getContextForTask(taskType);
  const branch = git(["branch", "--show-current"]) || "(detached)";
  const status = git(["status", "--short"]) || "(clean)";

  const lines = [
    "# Commerce Agent Preflight",
    "",
    `- branch: \`${branch}\``,
    "- status:",
    "```text",
    status,
    "```",
    "",
    "## Required context",
    ...context.load.map((item) => `- ${item}`),
    "",
    "## Suggested verification",
    ...context.verify.map((command) => `- \`${command}\``),
    "",
    "## Reminder",
    "- Do not touch unrelated dirty files or read secret files.",
  ];
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const taskTypeIndex = argv.indexOf("--task-type");
  const taskType = taskTypeIndex >= 0 ? argv[taskTypeIndex + 1] : undefined;
  if (!taskType) {
    console.error(
      "Usage: node scripts/agent_ops/preflight.mjs --task-type <type>",
    );
    return 2;
  }
  process.stdout.write(renderPreflight(taskType));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
