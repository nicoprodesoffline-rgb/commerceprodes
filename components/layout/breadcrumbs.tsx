import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://prodes.fr";

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${BASE_URL}${item.href}` } : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav
        aria-label="Fil d'Ariane"
        className="flex items-center gap-1.5 text-sm text-gray-500"
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {isLast || !item.href ? (
                <span className="text-gray-800">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-[#cc1818] transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    </>
  );
}
