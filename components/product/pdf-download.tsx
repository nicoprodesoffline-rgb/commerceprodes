import type { PdfLayout } from "@/lib/site-pdf/model";

export function PdfDownload({ familyKey, layout }: { familyKey: string; layout: PdfLayout | null }) {
  if (!layout) return null;
  return <a href={`/api/site/families/${encodeURIComponent(familyKey)}/pdf`} download className="inline-flex min-h-[44px] items-center text-sm font-medium underline" data-testid="family-pdf">Fiche PDF</a>;
}
