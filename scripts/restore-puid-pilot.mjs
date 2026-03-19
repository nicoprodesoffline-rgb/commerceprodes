#!/usr/bin/env node
/**
 * Restore variant SKUs from a puid-pilot backup file.
 *
 * Usage:
 *   node scripts/restore-puid-pilot.mjs --file ../docs/puid-pilot-backup-....json
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

const fileArg = argValue("--file");
if (!fileArg) {
  console.error("Missing --file <backup-json>");
  process.exit(1);
}

const ROOT = process.cwd();
const backupPath = path.resolve(ROOT, fileArg);
if (!fs.existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    if (process.env[k]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

loadEnv(path.join(ROOT, ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const rows = Array.isArray(backup.rows) ? backup.rows : [];

async function main() {
  let restored = 0;
  for (const row of rows) {
    const variantId = row.variant_id;
    const oldSku = row.old_sku;
    if (!variantId || !oldSku) continue;
    const { error } = await supabase
      .from("variants")
      .update({ sku: oldSku })
      .eq("id", variantId);
    if (error) throw new Error(`restore ${variantId}: ${error.message}`);
    restored += 1;
  }
  console.log(
    JSON.stringify(
      {
        backup_file: backupPath,
        restored_rows: restored,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("restore-puid-pilot failed:", err.message);
  process.exit(1);
});
