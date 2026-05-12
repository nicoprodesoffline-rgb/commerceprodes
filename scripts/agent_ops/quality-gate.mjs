#!/usr/bin/env node
import { execFileSync } from "node:child_process";

export const agentOpsTestCommand = "node --test tests/agent-ops/*.test.mjs";

const rules = [
  {
    reason: "agent-ops",
    matches: [
      "AGENTS.md",
      "CLAUDE.md",
      "docs/agent-ops/",
      "scripts/agent_ops/",
      "tests/agent-ops/",
      ".claude/",
    ],
    commands: [agentOpsTestCommand],
  },
  {
    reason: "storefront",
    matches: ["app/", "components/", "lib/", "public/", "app/page.tsx"],
    commands: ["npm run build"],
  },
  {
    reason: "data-sql",
    matches: [
      "docs/sql-migrations/",
      "docs/sql-backoffice.sql",
      "data/",
      "scripts/import-woocommerce.mjs",
      ".sql",
    ],
    commands: [
      "node scripts/agent_ops/review-pack.mjs",
      "Nico review before production SQL/data application",
    ],
  },
  {
    reason: "infra",
    matches: [
      "next.config.ts",
      "vercel.json",
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "proxy.ts",
      ".env.example",
    ],
    commands: ["npm run build", "npm test if package tooling is available"],
  },
];

export function buildQualityPlan(changedFiles) {
  const files = changedFiles
    .map((path) => path.trim().replace(/^\.\//, ""))
    .filter(Boolean);
  const reasons = [];
  const commands = [];

  for (const rule of rules) {
    if (files.some((file) => matchesAny(file, rule.matches))) {
      reasons.push(rule.reason);
      commands.push(...rule.commands);
    }
  }

  if (commands.length === 0) {
    reasons.push("fallback");
    commands.push("node scripts/agent_ops/review-pack.mjs");
  }

  return {
    changedFiles: files,
    reasons: Array.from(new Set(reasons)),
    commands: Array.from(new Set(commands)),
  };
}

function matchesAny(file, patterns) {
  return patterns.some(
    (pattern) =>
      file === pattern || file.startsWith(pattern) || file.includes(pattern),
  );
}

function gitLines(args) {
  const output = execFileSync("git", args, { encoding: "utf8" });
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function changedFilesFromGit() {
  const statusFiles = gitLines(["status", "--short"])
    .map((line) => line.slice(3).trim())
    .filter((path) => path && !path.endsWith("/"));
  const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...statusFiles, ...untracked]));
}

export function renderPlan(plan) {
  const lines = ["# Commerce Agent Ops Quality Gate", "", "## Reasons"];
  lines.push(...plan.reasons.map((reason) => `- ${reason}`));
  lines.push("", "## Recommended Commands");
  lines.push(...plan.commands.map((command) => `- \`${command}\``));
  lines.push("", "## Changed Files");
  if (plan.changedFiles.length) {
    lines.push(...plan.changedFiles.map((file) => `- ${file}`));
  } else {
    lines.push("- No changed files detected");
  }
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const asJson = argv.includes("--json");
  const filesIndex = argv.indexOf("--files");
  const files =
    filesIndex >= 0 ? argv.slice(filesIndex + 1) : changedFilesFromGit();
  const plan = buildQualityPlan(files);
  process.stdout.write(
    asJson ? `${JSON.stringify(plan, null, 2)}\n` : renderPlan(plan),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
