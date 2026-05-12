#!/usr/bin/env node
import { writeFileSync } from "node:fs";

export const universalLoad = ["AGENTS.md", "CLAUDE.md", "README.md", "package.json"];

export const avoid = [
  "Do not read .env, .env.local, .vercel, credential files, node_modules, .next, or large generated outputs by default."
];

export const taskContexts = {
  "agent-ops": {
    load: [
      "docs/agent-ops/AGENT_OPERATING_PROTOCOL.md",
      "docs/agent-ops/CONTEXT_LOADING.md",
      "docs/agent-ops/HARNESS_RATCHET.md",
      "docs/agent-ops/SECURITY_AND_ENFORCEMENT.md",
      "scripts/agent_ops/",
      "tests/agent-ops/"
    ],
    verify: ["node --test tests/agent-ops/*.test.mjs"]
  },
  storefront: {
    load: ["app/page.tsx", "relevant app route", "relevant components/", "relevant lib/ helper"],
    verify: ["npm run build", "browser check for visible UI when applicable"]
  },
  admin: {
    load: ["relevant admin route", "proxy.ts or middleware if auth/routing changed", "relevant lib/ helper"],
    verify: ["npm run build", "manual auth/routing check when applicable"]
  },
  "data-sql": {
    load: ["touched migration or data file", "data/supabase_schema.sql", "scripts/import-woocommerce.mjs if import behavior changed"],
    verify: ["node scripts/agent_ops/review-pack.mjs", "Nico review before production application"]
  },
  infra: {
    load: ["next.config.ts", "vercel.json", "package.json", "proxy.ts", ".env.example if public env shape changed"],
    verify: ["npm run build", "npm test if package tooling is available"]
  },
  docs: {
    load: ["target doc", "one upstream doc", "one linked downstream doc"],
    verify: ["Check links, commands, and stale local paths manually."]
  }
};

export function getContextForTask(taskType) {
  const task = taskContexts[taskType];
  if (!task) {
    throw new Error(`Unknown task type: ${taskType}. Valid task types: ${Object.keys(taskContexts).sort().join(", ")}`);
  }
  return {
    load: Array.from(new Set([...universalLoad, ...task.load])),
    verify: [...task.verify],
    avoid: [...avoid]
  };
}

export function renderContext(taskType) {
  const context = getContextForTask(taskType);
  const lines = [`# Context loading for \`${taskType}\``, "", "## Load"];
  lines.push(...context.load.map((item) => `- ${item}`));
  lines.push("", "## Verify", ...context.verify.map((item) => `- \`${item}\``));
  lines.push("", "## Avoid", ...context.avoid.map((item) => `- ${item}`));
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const taskTypeIndex = argv.indexOf("--task-type");
  const taskType = taskTypeIndex >= 0 ? argv[taskTypeIndex + 1] : undefined;
  const asJson = argv.includes("--json");
  const writePathIndex = argv.indexOf("--write");
  const writePath = writePathIndex >= 0 ? argv[writePathIndex + 1] : undefined;

  if (!taskType) {
    console.error("Usage: node scripts/agent_ops/context-loader.mjs --task-type <type> [--json] [--write <path>]");
    return 2;
  }

  const output = asJson ? `${JSON.stringify(getContextForTask(taskType), null, 2)}\n` : renderContext(taskType);
  if (writePath) {
    writeFileSync(writePath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
