/**
 * Bandeau UNIQUE de base fiscale d'un écran (friction 14, V5.1) : dit une fois, pour tous les montants de l'écran, ce que chaque ligne répétait. Rendu seulement quand toutes
 * les lignes affichées partagent la base « non précisée » (`uniformBasis`) ; sinon chaque ligne garde sa propre mention. Ne dit jamais plus que la publication : « non précisée » reste « non précisée ».
 */
import { basisNoticeText } from "@/components/site/format";

export function BasisNotice({ basis }: { basis: "UNQUALIFIED" }) {
  return (
    <p role="note" data-testid="basis-notice" data-basis={basis} className="rounded-[9px] border border-line bg-surface px-3 py-2 text-xs text-ink-2">
      {basisNoticeText()}
    </p>
  );
}
