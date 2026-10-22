import { NextResponse } from "next/server";
import { simulate } from "@/lib/simulator";
import { badJson, readJson } from "@/lib/simulator/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return badJson();
  const r = simulate("QUOTE_REQUEST", body);
  return NextResponse.json(r.body, { status: r.status });
}
