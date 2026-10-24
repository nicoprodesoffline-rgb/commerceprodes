// Outils de review A2 : serveur next start sur 3342, PID tenu et tué par ce script uniquement.
import { spawn } from "node:child_process";
import path from "node:path";
export const ROOT = "/Users/nico/Desktop/prodes-w1/review-a2";
export const PORT = 3342;
export const BASE = `http://127.0.0.1:${PORT}`;
async function answers() { try { await fetch(BASE + "/", { redirect: "manual", signal: AbortSignal.timeout(500) }); return true; } catch { return false; } }
export async function start(env) {
  if (await answers()) throw new Error("port 3342 occupé");
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", d => logs.push(String(d))); child.stderr.on("data", d => logs.push(String(d)));
  let exited = false; child.on("exit", () => (exited = true));
  const t = Date.now() + 30000;
  while (!(await answers())) { if (exited) throw new Error("exit:" + logs.join("")); if (Date.now() > t) throw new Error("timeout"); await new Promise(r => setTimeout(r, 150)); }
  console.log(`# PID ${child.pid} démarré ${JSON.stringify(env)}`);
  return { child, logs, stop: async () => { if (exited) return; const d = new Promise(r => child.once("exit", r)); process.kill(child.pid, "SIGTERM"); await d;
    for (let i = 0; i < 40 && (await answers()); i++) await new Promise(r => setTimeout(r, 100));
    console.log(`# PID ${child.pid} arrêté, port libre=${!(await answers())}`); } };
}
export async function req(method, p, { body, headers = {} } = {}) {
  const res = await fetch(BASE + p, { method, headers, body, redirect: "manual" });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString("utf8")); } catch {}
  return { status: res.status, headers: Object.fromEntries(res.headers), buf, text: buf.toString("utf8"), json };
}
export const jpost = (p, obj, headers = {}) => req("POST", p, { body: typeof obj === "string" || obj instanceof Uint8Array ? obj : JSON.stringify(obj), headers: { "content-type": "application/json", ...headers } });
export function line(label, r, extra = "") { console.log(`${label} → HTTP ${r.status} ${extra}`); }
