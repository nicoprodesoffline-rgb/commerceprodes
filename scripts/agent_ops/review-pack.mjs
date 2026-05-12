#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { buildQualityPlan } from "./quality-gate.mjs";

export function groupChangedFiles(changedFiles) {
  const groups = new Map();
  for (const file of changedFiles.filter(Boolean)) {
    const group = classify(file);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(file);
  }
  return groups;
}

function classify(file) {
  if (file === "AGENTS.md" || file === "CLAUDE.md" || file.startsWith("docs/agent-ops/")) return "agent contracts/docs";
  if (file.startsWith("scripts/agent_ops/")) return "agent ops scripts";
  if (file.startsWith("tests/agent-ops/")) return "agent ops tests";
  if (file.startsWith("docs/sql-migrations/") || file.startsWith("data/")) return "data/sql";
  if (file.startsWith("app/") || file.startsWith("components/")) return "ui";
  if (file === "package.json" || file === "next.config.ts" || file === "vercel.json" || file === "proxy.ts") return "infra";
  return "other";
}

export function renderReviewPack({ changedFiles, diffStat, qualityCommands, baselineNotes = [] }) {
  const lines = ["# Commerce Agent Ops Review Pack", ""];

  if (!changedFiles.length) {
    return [
      "# Commerce Agent Ops Review Pack",
      "",
      "No changed files detected.",
      "",
      "## Merge guidance",
      "",
      "Do not merge: there is nothing to review.",
      ""
    ].join("\n");
  }

  lines.push("## Changed files");
  for (const [group, files] of groupChangedFiles(changedFiles)) {
    lines.push(`- ${group}:`);
    lines.push(...files.map((file) => `  - ${file}`));
  }
  lines.push("", "## Diff stat", diffStat.trim() || "No diff stat available.");
  lines.push("", "## Recommended verification");
  lines.push(...(qualityCommands.length ? qualityCommands.map((command) => `- \`${command}\``) : ["- No quality commands supplied."]));
  lines.push("", "## Baseline notes");
  lines.push(...(baselineNotes.length ? baselineNotes.map((note) => `- ${note}`) : ["- No baseline notes supplied."]));
  lines.push("", "## Merge guidance", "", "Merge after recommended verification passes or after Nico accepts documented residual risk. Keep unrelated dirty files out of this branch.");
  return `${lines.join("\n")}\n`;
}

function gitLines(args) {
  const output = execFileSync("git", args, { encoding: "utf8" });
  return output.split("\n").map((line) => line.trimEnd()).filter(Boolean);
}

export function changedFilesFromGit() {
  const statusFiles = gitLines(["status", "--short"])
    .map((line) => line.slice(3).trim())
    .filter((path) => path && !path.endsWith("/"));
  const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...statusFiles, ...untracked]));
}

export function diffStatFromGit() {
  const diff = execFileSync("git", ["diff", "--stat"], { encoding: "utf8" }).trimEnd();
  const untrackedCount = gitLines(["ls-files", "--others", "--exclude-standard"]).length;
  return untrackedCount ? `${diff}\nUntracked files: ${untrackedCount}\n` : `${diff}\n`;
}

function main(argv) {
  const baselineNotes = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--baseline-note" && argv[i + 1]) baselineNotes.push(argv[i + 1]);
  }

  const changedFiles = changedFilesFromGit();
  const plan = buildQualityPlan(changedFiles);
  process.stdout.write(renderReviewPack({ changedFiles, diffStat: diffStatFromGit(), qualityCommands: plan.commands, baselineNotes }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
