"""Provisional BC1 spike fixture v0 — STAGING_FIXTURE, NOT the C0 authority.
Deterministic generation: same bytes on every run. Media = real PNG bytes (solid colour), SHA computed."""
import hashlib, json, struct, zlib, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MEDIA = ROOT / "media"

def png(w, h, rgb):
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def canon(v):
    if isinstance(v, float): raise TypeError("float forbidden")
    if isinstance(v, str): return unicodedata.normalize("NFC", v)
    if isinstance(v, list): return [canon(x) for x in v]
    if isinstance(v, dict): return {unicodedata.normalize("NFC", k): canon(x) for k, x in v.items()}
    return v

def canon_bytes(v):
    return json.dumps(canon(v), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

media_specs = {"fam_simple_main.png": (64, 48, (200, 30, 30)), "fam_gmce_main.png": (64, 48, (30, 120, 200)),
               "fam_esunny_main.png": (64, 48, (30, 160, 60)), "item_gmce_rouge_m.png": (48, 48, (220, 60, 60))}
media_refs = {}
for name, (w, h, rgb) in media_specs.items():
    data = png(w, h, rgb); (MEDIA / name).write_bytes(data)
    media_refs[name] = {"sha256": hashlib.sha256(data).hexdigest(), "mime": "image/png", "size": len(data), "file": f"media/{name}"}

def windows(item_key, base, tiers, promo=None):
    # tiers: list of (qmin, qmax|None, amount) for BASE [from, until) 2026-01-01 -> null
    out = []
    for i, (qmin, qmax, amt) in enumerate(tiers, 1):
        out.append({"rate_id": f"RATE-{item_key}-BASE-{i}", "valid_from_utc": "2026-01-01T00:00:00Z", "valid_until_utc": None,
                    "quantity_min": qmin, "quantity_max": qmax, "unit_amount": amt, "currency": "EUR", "tax_basis_or_status": "HT",
                    "offer_price_version_public": f"opv-{item_key}-base-v1", "layer": "BASE"})
    if promo:
        frm, until, tiers_p = promo
        for i, (qmin, qmax, amt) in enumerate(tiers_p, 1):
            out.append({"rate_id": f"RATE-{item_key}-PROMO-{i}", "valid_from_utc": frm, "valid_until_utc": until,
                        "quantity_min": qmin, "quantity_max": qmax, "unit_amount": amt, "currency": "EUR", "tax_basis_or_status": "HT",
                        "offer_price_version_public": f"opv-{item_key}-promo-v1", "layer": "PROMO"})
    return out

families = [
  {"public_family_key": "PF-SIMPLE01", "slug": "etabli-atelier-simple", "name": "Établi d'atelier SIMPLE (fixture)",
   "description_short": "STAGING_FIXTURE — établi d'atelier à plateau bois, une seule variante.",
   "description_long": "STAGING_FIXTURE — Description longue de démonstration. Aucune donnée fournisseur réelle. Plateau bois, piètement acier.",
   "primary_category_key": "CAT-ATELIER", "secondary_category_keys": ["CAT-MOBILIER"], "image_main_sha256": media_refs["fam_simple_main.png"]["sha256"],
   "variant_axes_schema": [],
   "items": [{"public_item_key": "PI-SIMPLE001", "variant_axes": {}, "status": "READY", "public_media_refs": [],
              "public_sell_price_windows": windows("PI-SIMPLE001", None, [(1, 9, "189.00"), (10, 19, "179.50"), (20, None, "169.90")])}]},
  {"public_family_key": "PF-GMCE0001", "slug": "gant-manutention-gmce", "name": "Gant de manutention GMCE (fixture)",
   "description_short": "STAGING_FIXTURE — gant de manutention, deux axes : couleur et taille.",
   "description_long": "STAGING_FIXTURE — Description longue de démonstration. Variantes explicitement admises ; une variante brouillon non tarifée n'est pas publiée.",
   "primary_category_key": "CAT-EPI", "secondary_category_keys": [], "image_main_sha256": media_refs["fam_gmce_main.png"]["sha256"],
   "variant_axes_schema": [{"axis": "couleur", "values": ["rouge", "bleu"]}, {"axis": "taille", "values": ["M", "L"]}],
   "items": [
     {"public_item_key": "PI-GMCE0001", "variant_axes": {"couleur": "rouge", "taille": "M"}, "status": "READY",
      "public_media_refs": [{"sha256": media_refs["item_gmce_rouge_m.png"]["sha256"], "mime": "image/png", "size": media_refs["item_gmce_rouge_m.png"]["size"], "role": "main"}],
      "public_sell_price_windows": windows("PI-GMCE0001", None, [(1, 9, "12.40"), (10, 19, "11.80"), (20, None, "10.95")],
                                           promo=("2026-11-02T23:00:00Z", "2026-11-30T23:00:00Z", [(1, None, "9.99")]))},
     {"public_item_key": "PI-GMCE0002", "variant_axes": {"couleur": "rouge", "taille": "L"}, "status": "READY", "public_media_refs": [],
      "public_sell_price_windows": windows("PI-GMCE0002", None, [(1, 9, "12.40"), (10, 19, "11.80"), (20, None, "10.95")])},
     {"public_item_key": "PI-GMCE0003", "variant_axes": {"couleur": "bleu", "taille": "M"}, "status": "READY", "public_media_refs": [],
      "public_sell_price_windows": windows("PI-GMCE0003", None, [(1, 9, "12.90"), (10, 19, "12.20"), (20, None, "11.40")])}
   ],
   "unpublished_note": "La combinaison bleu/L existe comme brouillon non tarifé côté Factory et n'est PAS dans ce payload (NON_READY)."},
  {"public_family_key": "PF-ESUNNY01", "slug": "store-exterieur-esunny", "name": "Store extérieur ESUNNY (fixture)",
   "description_short": "STAGING_FIXTURE — store extérieur, deux axes ; une combinaison est interdite par preuve négative.",
   "description_long": "STAGING_FIXTURE — Description longue de démonstration. La combinaison toile=acrylique × largeur=400 est interdite ; elle ne doit jamais être proposée ni vendable.",
   "primary_category_key": "CAT-EXTERIEUR", "secondary_category_keys": ["CAT-STORES"], "image_main_sha256": media_refs["fam_esunny_main.png"]["sha256"],
   "variant_axes_schema": [{"axis": "toile", "values": ["acrylique", "polyester"]}, {"axis": "largeur", "values": ["300", "400"]}],
   "forbidden_combinations": [{"toile": "acrylique", "largeur": "400"}],
   "items": [
     {"public_item_key": "PI-ESUNNY01", "variant_axes": {"toile": "acrylique", "largeur": "300"}, "status": "READY", "public_media_refs": [],
      "public_sell_price_windows": windows("PI-ESUNNY01", None, [(1, None, "349.00")])},
     {"public_item_key": "PI-ESUNNY02", "variant_axes": {"toile": "polyester", "largeur": "300"}, "status": "READY", "public_media_refs": [],
      "public_sell_price_windows": windows("PI-ESUNNY02", None, [(1, None, "299.00")])},
     {"public_item_key": "PI-ESUNNY03", "variant_axes": {"toile": "polyester", "largeur": "400"}, "status": "READY", "public_media_refs": [],
      "public_sell_price_windows": windows("PI-ESUNNY03", None, [(1, None, "359.00")])}
   ]}
]
categories = [{"category_key": "CAT-ATELIER", "name": "Atelier", "parent": None}, {"category_key": "CAT-MOBILIER", "name": "Mobilier", "parent": None},
              {"category_key": "CAT-EPI", "name": "Équipements de protection", "parent": None}, {"category_key": "CAT-EXTERIEUR", "name": "Extérieur", "parent": None},
              {"category_key": "CAT-STORES", "name": "Stores", "parent": "CAT-EXTERIEUR"}]
items_count = sum(len(f["items"]) for f in families)
payload = {
  "contract_version": "site_snapshot.PROVISIONAL_v0_BC1_SPIKE", "fixture_status": "STAGING_FIXTURE — PROVISOIRE, NON AUTORITÉ C0 ; à remplacer par les golden fixtures C0 gelées (BC0)",
  "publication_id": "pub-provisional-0001", "projection_id": "proj-provisional-0001", "catalogue_sequence": 1,
  "as_of_utc": "2026-10-22T20:00:00Z", "generated_at_utc": "2026-10-22T20:00:00Z", "scope": "FULL_READY_CATALOG", "scope_key": "site:staging",
  "categories": categories, "families": families,
  "media_refs": [{"sha256": m["sha256"], "mime": m["mime"], "size": m["size"]} for m in media_refs.values()],
  "manifest_counts": {"families": len(families), "items": items_count, "media": len(media_refs)}
}
b = canon_bytes(payload)
(ROOT / "site_snapshot_provisional_v0.json").write_bytes(b)
(ROOT / "site_snapshot_provisional_v0.pretty.json").write_text(json.dumps(canon(payload), ensure_ascii=False, indent=2, sort_keys=True) + "\n")
scenarios = {
  "fixture_status": "STAGING_FIXTURE — scénarios communs B/D",
  "S01_catalogue": "Page d'accueil fixe + liste des catégories (5) + liste des familles (3) ; aucune famille achetable directement.",
  "S02_famille_simple": "Fiche PF-SIMPLE01 : image Famille en premier, descriptions courte/longue, 1 item, grille de paliers 1-9 / 10-19 / 20+ affichée depuis les fenêtres SELL (pas de calcul PBQ).",
  "S03_gmce_variantes": "Fiche PF-GMCE0001 : sélecteur couleur×taille ; bleu/L NON proposé (absent du payload) ; rouge/M a sa propre image ; PROMO du 2026-11-02T23:00Z au 2026-11-30T23:00Z affichée comme future (instant de test 2026-10-22T20:00Z) puis active (instant de test 2026-11-15T12:00Z).",
  "S04_esunny_interdit": "Fiche PF-ESUNNY01 : acrylique×400 explicitement interdit (jamais sélectionnable, jamais dans le panier), les 3 autres combinaisons achetables.",
  "S05_paliers": "Panier : PI-SIMPLE001 qty 1 -> 189.00 ; qty 10 -> 179.50 ; qty 20 -> 169.90 ; franchissement 9->10 et 19->20 ; montants = chaînes décimales, somme exacte côté serveur.",
  "S06_panier_unique": "Un seul panier ; les lignes réellement affichées sont envoyées au serveur et revalidées contre le snapshot (clé item, variante, quantité, rate_id, montant). Aucun second panier (localStorage divergent / cookie cartId).",
  "S07_devis": "Demande de devis : lignes + contact minimal -> simulateur contractuel étiqueté SIMULATION (pas de persistance revendiquée) ; même idempotency_key + même payload -> même reçu ; même clé + payload différent -> refus DUPLICATE_KEY_DIFFERENT_PAYLOAD.",
  "S08_commande": "Commande représentative : montant accepté revalidé ; montant falsifié -> PRICE_CHANGED ; variante invalide/interdite -> INVALID_VARIANT ; quantité hors fenêtre -> PRICE_WINDOW_UNAVAILABLE ; aucun 'success:true' sans passage par le simulateur ; étiquette SIMULATION visible.",
  "S09_refus": "Toute route legacy dangereuse (admin, checkout legacy, devis legacy, revalidate) -> 404/410 ; aucune mutation possible ; aucun import Supabase actif au runtime.",
  "S10_responsive_a11y": "Parcours S02/S03/S05 à 1440, 1024, 390 px ; navigation clavier du sélecteur de variantes et du panier ; zoom 200 % sans perte de contenu ; états honnêtes (SIMULATION, prix indisponible)."
}
(ROOT / "SCENARIOS.json").write_text(json.dumps(scenarios, ensure_ascii=False, indent=2) + "\n")
manifest = {}
for p in sorted(ROOT.rglob("*")):
    if p.is_file() and p.name != "MANIFEST.sha256":
        manifest[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
(ROOT / "MANIFEST.sha256").write_text("".join(f"{v}  {k}\n" for k, v in manifest.items()))
print("payload_bytes", len(b), "sha256", hashlib.sha256(b).hexdigest()); print(open(ROOT / "MANIFEST.sha256").read())
