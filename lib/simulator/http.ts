import { NextResponse } from "next/server";
import { SIMULATION_LABEL } from "./index";

const MAX_BODY_BYTES = 64 * 1024;

/** Lit un corps JSON borné ; null si invalide. */
export async function readJson(req: Request): Promise<unknown | null> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function badJson() {
  return NextResponse.json({ ...SIMULATION_LABEL, error: "INVALID_REQUEST" }, { status: 400 });
}
