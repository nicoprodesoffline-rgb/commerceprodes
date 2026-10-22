import { NextResponse } from "next/server";
import { simulate, SIMULATION_LABEL, type Kind } from "./simulator";

export function makeSimulationPost(kind: Kind) {
  return async function POST(req: Request) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ...SIMULATION_LABEL, ok: false, error: { code: "INVALID_REQUEST", detail: "JSON invalide" } },
        { status: 400 },
      );
    }
    const r = simulate(kind, body);
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  };
}
