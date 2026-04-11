#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMERCE_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(COMMERCE_DIR, ".env.local");

function loadEnv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest
      .join("=")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? fallback : process.argv[idx + 1] || fallback;
}

const BACKUP_PATH = argValue("--backup");
const APPLY = process.argv.includes("--apply");

if (!BACKUP_PATH) {
  console.error(
    "Usage: node scripts/restore-approved-puids.mjs --backup ../docs/puid-db-backup-....json [--apply]",
  );
  process.exit(1);
}

loadEnv(ENV_PATH);
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error("Missing Supabase env vars in .env.local");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const backup = JSON.parse(
  fs.readFileSync(path.resolve(COMMERCE_DIR, BACKUP_PATH), "utf8"),
);
const result = {
  mode: APPLY ? "apply" : "dry_run",
  restored: { products: 0, variants: 0 },
  errors: [],
};

if (APPLY) {
  for (const row of backup.products || []) {
    const payload = {
      sku: row.sku ?? null,
      puid: row.puid ?? null,
      puid_root: row.puid_root ?? null,
      puid_price_branch: row.puid_price_branch ?? null,
      puid_style_branch: row.puid_style_branch ?? null,
      puid_generated_at: row.puid_generated_at ?? null,
    };
    const { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", row.id);
    if (error) result.errors.push(`products:${row.id}:${error.message}`);
    else result.restored.products += 1;
  }

  for (const row of backup.variants || []) {
    const payload = {
      sku: row.sku ?? null,
      puid: row.puid ?? null,
      puid_root: row.puid_root ?? null,
      puid_price_branch: row.puid_price_branch ?? null,
      puid_style_branch: row.puid_style_branch ?? null,
      puid_generated_at: row.puid_generated_at ?? null,
    };
    const { error } = await supabase
      .from("variants")
      .update(payload)
      .eq("id", row.id);
    if (error) result.errors.push(`variants:${row.id}:${error.message}`);
    else result.restored.variants += 1;
  }
}

console.log(JSON.stringify(result, null, 2));
