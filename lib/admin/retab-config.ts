import fs from "fs";
import path from "path";

const DEFAULT_RETAB_DIR = path.resolve(
  process.cwd(),
  "..",
  "..",
  "retab-extraction",
);
const DEFAULT_RETAB_PYTHON = path.join(
  DEFAULT_RETAB_DIR,
  ".venv",
  "bin",
  "python",
);

export const RETAB_DIR = process.env.RETAB_DIR ?? DEFAULT_RETAB_DIR;
export const RETAB_OUTPUTS_DIR =
  process.env.RETAB_OUTPUTS_DIR ?? path.join(RETAB_DIR, "outputs");
export const RETAB_VALIDATED_DIR = path.join(RETAB_OUTPUTS_DIR, "validated");
const computedPython = path.join(RETAB_DIR, ".venv", "bin", "python");
export const RETAB_PYTHON_BIN =
  process.env.RETAB_PYTHON_BIN ??
  (fs.existsSync(computedPython)
    ? computedPython
    : fs.existsSync(DEFAULT_RETAB_PYTHON)
      ? DEFAULT_RETAB_PYTHON
      : "python3");

export const RETAB_PIPELINE_SCOPE = "expanded_only" as const;
export const RETAB_PIPELINE_SCOPE_MESSAGE =
  "Cette integration commerce s'arrete a la revue post-engine. Les etapes PUID, preview produit et import Supabase restent hors perimetre migre.";
