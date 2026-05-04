import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const adminPassword = envText.match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim();

if (!adminPassword) {
  throw new Error("ADMIN_PASSWORD missing from .env.local");
}

const url =
  "http://localhost:3000/api/admin/data-factory/retab/ingest?dry_run=true";
const body = JSON.stringify({
  familles: [
    {
      nom_gamme: "Dry run gate check",
      lignes: [{ reference: "DRY-RUN-1", designation: "Produit test" }],
    },
  ],
});

function post(headers = []) {
  const outputFile = `/tmp/commerce-admin-gate-${Math.random()
    .toString(36)
    .slice(2)}.json`;
  const args = [
    "-sS",
    "-o",
    outputFile,
    "-w",
    "%{http_code} %{redirect_url} %{content_type}",
    "-X",
    "POST",
    "-H",
    "Content-Type: application/json",
  ];
  for (const header of headers) {
    args.push("-H", header);
  }
  args.push("--data-binary", "@-", url);

  const meta = execFileSync("curl", args, {
    input: body,
    encoding: "utf8",
  }).trim();
  const [statusText, redirectUrl, contentType] = meta.split(" ");
  return {
    status: Number(statusText),
    redirectUrl,
    contentType,
    body: readFileSync(outputFile, "utf8"),
  };
}

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

const noAuth = post();
assert(noAuth.status < 200 || noAuth.status >= 300, "no-auth request passed", {
  status: noAuth.status,
  body: noAuth.body,
});

const badAuth = post(["Authorization: Bearer wrong-token"]);
assert(
  badAuth.status === 401 && badAuth.contentType.includes("application/json"),
  "bad bearer should return a JSON 401 instead of a gate redirect",
  badAuth,
);

const validAuth = post([`Authorization: Bearer ${adminPassword}`]);
assert(validAuth.status !== 307, "valid bearer was redirected by site gate", {
  status: validAuth.status,
  redirectUrl: validAuth.redirectUrl,
  body: validAuth.body,
});
assert(
  validAuth.contentType.includes("application/json"),
  "valid bearer should reach the API route and return JSON",
  validAuth,
);

const parsed = JSON.parse(validAuth.body);
assert(
  parsed.dry_run === true || typeof parsed.error === "string",
  "valid bearer should return dry_run JSON or an actionable business error",
  parsed,
);

console.log(
  JSON.stringify(
    {
      noAuth: { status: noAuth.status, redirectUrl: noAuth.redirectUrl },
      badAuth: { status: badAuth.status, contentType: badAuth.contentType },
      validAuth: {
        status: validAuth.status,
        contentType: validAuth.contentType,
        responseKind: parsed.dry_run === true ? "dry_run" : "business_error",
      },
    },
    null,
    2,
  ),
);
