'use client';

import { useState } from 'react';

export function AbandonedCartRow({
  id,
  date,
  email,
  productList,
  moreCount,
  totalHt,
  relanceText,
}: {
  id: string;
  date: string;
  email: string | null;
  productList: string;
  moreCount: number;
  totalHt: string;
  relanceText: string;
}) {
  const [copied, setCopied] = useState(false);
  const [recovered, setRecovered] = useState(false);

  const handleCopyRelance = async () => {
    try {
      await navigator.clipboard.writeText(relanceText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleMarkRecovered = async () => {
    try {
      await fetch(`/api/admin/paniers-abandonnes/${id}/recover`, { method: 'POST' });
      setRecovered(true);
    } catch {
      // Ignore
    }
  };

  if (recovered) return null;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{date}</td>
      <td className="px-4 py-3">
        {email ? (
          <a
            href={`mailto:${email}`}
            className="text-blue-600 hover:underline"
          >
            {email}
          </a>
        ) : (
          <span className="text-gray-400 italic">Non renseigné</span>
        )}
      </td>
      <td className="hidden px-4 py-3 text-gray-700 max-w-xs lg:table-cell">
        <span className="line-clamp-1">{productList}</span>
        {moreCount > 0 && (
          <span className="text-xs text-gray-400"> +{moreCount} autre{moreCount > 1 ? 's' : ''}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">{totalHt}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleCopyRelance}
            title="Copier le message de relance"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:border-[#cc1818] hover:text-[#cc1818] transition-colors"
          >
            {copied ? '✓ Copié' : '📧 Relancer'}
          </button>
          <button
            onClick={handleMarkRecovered}
            title="Marquer comme récupéré"
            className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 transition-colors"
          >
            ✓ Récupéré
          </button>
        </div>
      </td>
    </tr>
  );
}
