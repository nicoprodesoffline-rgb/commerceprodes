import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Fil d'Ariane accessible (nav + liste ordonnée, `aria-current` sur la page), sur UNE ligne : les intitulés trop longs sont tronqués (jamais de « / » en début de ligne). Aucun JSON-LD (pas de SEO W1). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-ink-2">
      <ol className="flex flex-nowrap items-center gap-x-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className={`flex items-center gap-1.5 ${i === 0 ? "shrink-0" : "min-w-0"}`}>
              {i > 0 && <span aria-hidden="true" className="shrink-0">/</span>}
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined} className={`truncate ${last ? "text-ink" : ""}`}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="inline-flex min-h-[44px] min-w-0 items-center underline-offset-2 hover:underline">
                  <span className="truncate">{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
