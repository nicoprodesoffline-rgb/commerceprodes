import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Fil d'Ariane accessible (nav + liste ordonnée, `aria-current` sur la page). Aucun JSON-LD (pas de SEO W1). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-ink-2">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined} className={last ? "text-ink" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="inline-flex min-h-[34px] items-center underline-offset-2 hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
