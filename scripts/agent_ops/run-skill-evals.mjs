#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const configPath = resolve(root, "agent-skills-eval.yaml");
const evalPath = resolve(
  root,
  "agent-skills/commerce-agent-ops/evals/evals.json",
);
const workspace = resolve(root, ".agent-runs/agent-skills-eval");

export function loadEvals(split) {
  const data = JSON.parse(readFileSync(evalPath, "utf8"));
  return split ? data.evals.filter((item) => item.split === split) : data.evals;
}

export function buildCommand() {
  return ["npx", "agent-skills-eval", "--config", relative(root, configPath)];
}

export function renderSummary({ split, dryRun }) {
  const command = buildCommand();
  const evals = loadEvals(split);
  return [
    "# Commerce Agent Skill Eval Runner",
    "",
    `- config: \`${relative(root, configPath)}\``,
    `- workspace: \`${relative(root, workspace)}\``,
    "- api key env: `OPENAI_API_KEY`",
    `- split: \`${split || "all"}\``,
    `- eval cases selected: \`${evals.length}\``,
    `- mode: \`${dryRun ? "dry-run" : "run"}\``,
    "",
    "## Command",
    "",
    "```bash",
    command
      .map((part) => JSON.stringify(part))
      .join(" ")
      .replaceAll('"', ""),
    "```",
    "",
  ].join("\n");
}

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const split = valueAfter(argv, "--split");
  if (split && !["optimization", "holdout"].includes(split)) {
    console.error("--split must be optimization or holdout");
    return 2;
  }
  if (!existsSync(configPath) || !existsSync(evalPath)) {
    console.error("Missing agent-skills-eval config or evals file.");
    return 2;
  }
  process.stdout.write(renderSummary({ split, dryRun }));
  if (dryRun) return 0;
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is required to run agent-skills-eval. Use --dry-run for setup checks.",
    );
    return 2;
  }
  mkdirSync(workspace, { recursive: true });
  const [cmd, ...args] = buildCommand();
  return spawnSync(cmd, args, { stdio: "inherit" }).status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
