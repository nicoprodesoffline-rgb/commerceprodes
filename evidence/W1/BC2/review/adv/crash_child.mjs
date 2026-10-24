// Processus enfant : ACTIVATE de s11, SIGKILL de soi-même dès que le COMMIT a été acquitté par PostgreSQL.
import { ACTIVATE, deps, loadCase, newPool } from "./common.mjs";
const pool = newPool();
const realConnect = pool.connect.bind(pool);
pool.connect = (cb) => {
  if (typeof cb === "function") return realConnect(cb); // pool.query (forme callback) : non instrumentée
  return (async () => {
  const client = await realConnect();
  const q = client.query.bind(client);
  client.query = async (...args) => {
    const r = await q(...args);
    if (args[0] === "COMMIT") { console.log("COMMIT acquitté, SIGKILL avant réponse"); process.kill(process.pid, "SIGKILL"); await new Promise(() => {}); }
    return r;
  };
  return client;
  })();
};
const legit = loadCase("F_FULL_CORRUPT.legit_withdrawals_listed");
await ACTIVATE(deps(pool, { now: legit.now, policy: legit.policy }), legit);
console.log("ERREUR : réponse produite");
