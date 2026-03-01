"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Bundle } from "app/api/bundles/route";

interface BundleWidgetProps {
  productId: string;
  onAddBundle?: (items: Array<{ handle: string; title: string; quantity: number }>) => void;
}

export function BundleWidget({ productId, onAddBundle }: BundleWidgetProps) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/bundles?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d) => setBundles(d.bundles ?? []))
      .catch(() => setBundles([]))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading || bundles.length === 0) return null;

  function handleAdd(bundle: Bundle) {
    if (!onAddBundle) return;
    const items = (bundle.items ?? [])
      .filter((item) => item.handle)
      .map((item) => ({
        handle: item.handle!,
        title: item.title,
        quantity: item.quantity,
      }));
    if (items.length > 0) {
      onAddBundle(items);
      setAddedId(bundle.id);
      setTimeout(() => setAddedId(null), 2500);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-base font-semibold text-gray-900">Packs recommandés</h3>
      {bundles.map((bundle) => {
        const discountLabel =
          bundle.discount_value > 0
            ? bundle.discount_type === "percent"
              ? `-${bundle.discount_value}%`
              : `-${bundle.discount_value} €`
            : null;

        return (
          <div
            key={bundle.id}
            className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-900">{bundle.title}</span>
                  {discountLabel && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-white">
                      {discountLabel}
                    </span>
                  )}
                </div>
                {bundle.description && (
                  <p className="mt-1 text-xs text-amber-700">{bundle.description}</p>
                )}

                {/* Items list */}
                {bundle.items && bundle.items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {bundle.items.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-amber-800">
                        {item.image_url && (
                          <Image
                            src={item.image_url}
                            alt={item.title}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded object-cover"
                          />
                        )}
                        <span>
                          × {item.quantity} —{" "}
                          {item.handle ? (
                            <Link href={`/product/${item.handle}`} className="underline hover:text-amber-900">
                              {item.title}
                            </Link>
                          ) : (
                            item.title
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {onAddBundle && (
              <button
                onClick={() => handleAdd(bundle)}
                className="mt-3 w-full rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
                disabled={addedId === bundle.id}
              >
                {addedId === bundle.id ? "✓ Pack ajouté au panier" : "Ajouter le pack au panier"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
