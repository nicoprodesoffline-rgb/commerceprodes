// Serveur `next start` d'un scénario F_NAV_* (document C0 dérivé, voir nav-fixtures.mjs), partagé par la recette
// HTTP (navigation.http.mjs, sans navigateur) et la recette navigateur (menu.ui.mjs). Port $NAV_PORT (défaut 3120).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const PORT = Number(process.env.NAV_PORT ?? 3120);
export const BASE = `http://127.0.0.1:${PORT}`;

async function portAnswers() {
  try {
    await fetch(BASE + "/", { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

export async function withServer(fixture, fn) {
  assert.equal(await portAnswers(), false, `port ${PORT} occupé`);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NEXT_TELEMETRY_DISABLED: "1",
      SITE_ENV: "staging",
      SITE_NOW_UTC: "2026-10-19T06:00:00Z",
      SITE_CATALOG_SOURCE: "fixture",
      SITE_CATALOG_FIXTURE: `${fixture}/snapshot_nav.json`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let exited = false;
  child.on("exit", () => (exited = true));
  const deadline = Date.now() + 30_000;
  while (!(await portAnswers())) {
    if (exited || Date.now() > deadline) throw new Error("serveur non démarré");
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    await fn();
  } finally {
    if (!exited) {
      const done = new Promise((r) => child.once("exit", r));
      process.kill(child.pid, "SIGTERM"); // PID lancé par ce script uniquement
      await done;
    }
  }
}

export const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, text: await r.text() };
};
