import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "lib/admin/auth";
import { RETAB_OUTPUTS_DIR } from "lib/admin/retab-config";
import type {
  ExpandedData,
  ExpandedCorrection,
  ExpandedCorrectionsFile,
} from "lib/admin/pipeline-types";
import fs from "fs";
import path from "path";

function sanitizeName(name: string): boolean {
  return /^[\w.\-]+$/.test(name);
}

/** Find the expanded JSON file for a given validated extraction name. */
function findExpandedFile(name: string): string | null {
  const baseName = name.replace(".json", "");
  const candidate = path.join(RETAB_OUTPUTS_DIR, baseName + "_expanded.json");
  if (!candidate.startsWith(RETAB_OUTPUTS_DIR)) return null;
  if (!fs.existsSync(candidate)) return null;
  return candidate;
}

function correctionsPath(name: string): string {
  const baseName = name.replace(".json", "");
  return path.join(RETAB_OUTPUTS_DIR, baseName + "_expanded_corrections.json");
}

function loadCorrections(name: string): ExpandedCorrectionsFile | null {
  const p = correctionsPath(name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/** Apply corrections to expanded data in-place. */
function applyCorrections(
  data: ExpandedData,
  corrections: ExpandedCorrection[],
): void {
  for (const c of corrections) {
    switch (c.type) {
      case "edit_variant": {
        // Find variants for this product, then index
        const productVariants = data.variants.filter(
          (v) => v.product_ref === c.product_ref,
        );
        const variant = productVariants[c.variant_idx];
        if (variant) {
          (variant as Record<string, unknown>)[c.field] = c.new_value;
        }
        break;
      }
      case "edit_product": {
        const product = data.products.find((p) => p.ref === c.product_ref);
        if (product) {
          (product as unknown as Record<string, unknown>)[c.field] =
            c.new_value;
        }
        break;
      }
      case "reclassify_axis": {
        const product = data.products.find((p) => p.ref === c.product_ref);
        if (!product) break;

        // Move axis at product level
        if (c.from === "prix" && c.to === "style") {
          product.axes_prix = product.axes_prix.filter(
            (a) => a !== c.axis_name,
          );
          product.axes_prix_effectif = product.axes_prix_effectif.filter(
            (a) => a !== c.axis_name,
          );
          if (!product.axes_style.includes(c.axis_name))
            product.axes_style.push(c.axis_name);
          if (!product.axes_style_effectif.includes(c.axis_name))
            product.axes_style_effectif.push(c.axis_name);
        } else {
          product.axes_style = product.axes_style.filter(
            (a) => a !== c.axis_name,
          );
          product.axes_style_effectif = product.axes_style_effectif.filter(
            (a) => a !== c.axis_name,
          );
          if (!product.axes_prix.includes(c.axis_name))
            product.axes_prix.push(c.axis_name);
          if (!product.axes_prix_effectif.includes(c.axis_name))
            product.axes_prix_effectif.push(c.axis_name);
        }

        // Cascade to variants
        const variants = data.variants.filter(
          (v) => v.product_ref === c.product_ref,
        );
        for (const v of variants) {
          const value =
            c.from === "prix"
              ? v.attributs_prix_computed[c.axis_name]
              : v.attributs_style_computed[c.axis_name];
          if (value !== undefined) {
            if (c.from === "prix") {
              delete v.attributs_prix_computed[c.axis_name];
              v.attributs_style_computed[c.axis_name] = value;
            } else {
              delete v.attributs_style_computed[c.axis_name];
              v.attributs_prix_computed[c.axis_name] = value;
            }
          }
        }
        break;
      }
      case "move_variant": {
        const variant = data.variants[c.variant_idx];
        if (variant) {
          variant.product_ref = c.to_product_ref;
          // Update variant counts
          const fromProd = data.products.find(
            (p) => p.ref === c.from_product_ref,
          );
          const toProd = data.products.find((p) => p.ref === c.to_product_ref);
          if (fromProd) fromProd.variants_count--;
          if (toProd) toProd.variants_count++;
        }
        break;
      }
      case "delete_product": {
        data.products = data.products.filter((p) => p.ref !== c.product_ref);
        data.variants = data.variants.filter(
          (v) => v.product_ref !== c.product_ref,
        );
        break;
      }
    }
  }
}

/**
 * GET /api/admin/pipeline/extractions/[name]/expanded
 * Load expanded JSON with corrections applied on top.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { name } = await params;
  if (!sanitizeName(name))
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });

  const expandedFile = findExpandedFile(name);
  if (!expandedFile)
    return NextResponse.json(
      { error: "Fichier expanded introuvable", exists: false },
      { status: 404 },
    );

  try {
    const data: ExpandedData = JSON.parse(
      fs.readFileSync(expandedFile, "utf-8"),
    );
    const correctionsFile = loadCorrections(name);

    if (correctionsFile && correctionsFile.corrections.length > 0) {
      applyCorrections(data, correctionsFile.corrections);
    }

    return NextResponse.json({
      exists: true,
      data,
      corrections_count: correctionsFile?.corrections.length ?? 0,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/pipeline/extractions/[name]/expanded
 * Save corrections to a separate file (append mode).
 * Body: { corrections: ExpandedCorrection[] }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!checkAdminAuth(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { name } = await params;
  if (!sanitizeName(name))
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });

  const expandedFile = findExpandedFile(name);
  if (!expandedFile)
    return NextResponse.json(
      { error: "Fichier expanded introuvable" },
      { status: 404 },
    );

  let body: { corrections: ExpandedCorrection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!Array.isArray(body.corrections) || body.corrections.length === 0) {
    return NextResponse.json(
      { error: "corrections[] requis et non vide" },
      { status: 400 },
    );
  }

  try {
    const p = correctionsPath(name);
    const now = new Date().toISOString();
    let file: ExpandedCorrectionsFile;

    if (fs.existsSync(p)) {
      file = JSON.parse(fs.readFileSync(p, "utf-8"));
      file.updated_at = now;
      file.corrections.push(...body.corrections);
    } else {
      file = {
        source_expanded: path.basename(expandedFile),
        created_at: now,
        updated_at: now,
        corrections: body.corrections,
      };
    }

    fs.writeFileSync(p, JSON.stringify(file, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      total_corrections: file.corrections.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
