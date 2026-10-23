/**
 * Traduction française des codes C0 §13 et des statuts SITE affichés au client. Le code n'est JAMAIS masqué :
 * `codeMessage()` rend « texte (code CODE) ». Aucune logique : la décision est celle du serveur.
 */
const TEXT: Record<string, string> = {
  PAYLOAD_MALFORMED: "La demande envoyée est illisible.",
  SCHEMA_UNSUPPORTED: "Version de demande non reconnue par le serveur.",
  INVALID_DATA: "Certaines informations sont invalides ou incomplètes.",
  DUPLICATE_LINE: "Le même article figure deux fois : regroupez la quantité sur une seule ligne.",
  INVALID_VARIANT: "Cette combinaison d'options n'est pas proposée.",
  ITEM_SUPERSEDED: "Cet article a été remplacé par une nouvelle référence.",
  ITEM_RETIRED: "Cet article a été retiré du catalogue.",
  ITEM_NOT_PUBLISHED: "Cet article n'est pas publié dans le catalogue actuel.",
  PRICE_WINDOW_UNAVAILABLE: "Aucun prix publié ne s'applique à cette quantité maintenant (devis sans prix possible).",
  PRICE_WINDOW_OVERLAP: "Prix ambigu dans la publication : article momentanément non commandable.",
  CATALOG_UNSAFE: "Le catalogue est momentanément indisponible par sécurité.",
  CART_STALE: "Le catalogue a été mis à jour depuis l'affichage de votre panier : vérifiez les prix puis confirmez de nouveau.",
  CATALOG_CHANGED: "Le catalogue ou les prix ont changé depuis leur affichage : vérifiez puis confirmez de nouveau.",
  PRICE_CHANGED: "Le prix a été actualisé. Vérifiez le nouveau montant avant de confirmer.",
  DUPLICATE_KEY_DIFFERENT_PAYLOAD: "Cette demande a déjà été envoyée avec un contenu différent : rechargez la page.",
  DB_WRITE_FAILED: "L'enregistrement a échoué : rien n'a été enregistré. Vous pouvez réessayer.",
  UNAUTHORIZED: "Code d'accès manquant.",
  NOT_FOUND: "Aucun reçu ne correspond à cette référence et à ce code.",
  // Statuts SITE (hors C0)
  CATALOG_UNAVAILABLE: "Le catalogue est momentanément indisponible.",
  CONFIG_INVALID: "La boutique est momentanément indisponible (configuration serveur).",
  CONTENT_TYPE_REFUSED: "Requête refusée (format non accepté).",
  ORIGIN_REFUSED: "Requête refusée (origine non autorisée).",
  TRANSPORT_ERROR: "Le service d'enregistrement est momentanément indisponible : rien n'a été enregistré.",
  NETWORK: "Serveur injoignable : rien n'a été envoyé ou la réponse est perdue. Vous pouvez réessayer à l'identique.",
};

export function codeText(code: string): string {
  return TEXT[code] ?? "Refus du serveur.";
}

export function codeMessage(code: string): string {
  return `${codeText(code)} (code ${code})`;
}

export function codesMessage(codes: readonly string[]): string {
  return codes.length === 0 ? "Refus sans code." : codes.map(codeMessage).join(" ");
}
