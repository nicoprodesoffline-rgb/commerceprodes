"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface AdminCat {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  cover_image_url: string | null;
  product_count: number;
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const password = typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : "";

  useEffect(() => {
    fetch("/api/admin/ia/categories-list", {
      headers: { Authorization: `Bearer ${password}` },
    })
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [password]);

  const handleSaveImage = async (catId: string) => {
    setSavingId(catId);
    try {
      const res = await fetch(`/api/admin/categories/${catId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ cover_image_url: draftUrl }),
      });
      if (res.ok) {
        setCategories((prev) =>
          prev.map((c) =>
            c.id === catId ? { ...c, cover_image_url: draftUrl } : c,
          ),
        );
        setSavedId(catId);
        setTimeout(() => setSavedId(null), 2000);
        setEditingId(null);
        setDraftUrl("");
      }
    } catch {
      /* ignore */
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Chargement…</div>;
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Catégories <span className="text-base font-normal text-gray-400">({categories.length})</span>
        </h1>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Slug</th>
              <th className="w-24 px-4 py-3 text-center">Image</th>
              <th className="w-20 px-4 py-3 text-right">Produits</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{cat.name}</p>
                  {cat.parent_id && (
                    <p className="text-xs text-gray-400">Sous-catégorie</p>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{cat.slug}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center">
                    {cat.cover_image_url ? (
                      <div className="relative h-12 w-20 overflow-hidden rounded border border-gray-200 bg-gray-50">
                        <Image
                          src={cat.cover_image_url}
                          alt={cat.name}
                          fill
                          className="object-cover"
                          sizes="80px"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-12 w-20 rounded border border-dashed border-gray-200 bg-gray-50" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{cat.product_count}</td>
                <td className="px-4 py-3">
                  {editingId === cat.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={draftUrl}
                        onChange={(e) => setDraftUrl(e.target.value)}
                        placeholder="https://…"
                        autoFocus
                        className="w-52 rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]"
                      />
                      {draftUrl && (
                        <div className="relative h-8 w-12 overflow-hidden rounded border border-gray-200 bg-gray-50">
                          <Image
                            src={draftUrl}
                            alt="preview"
                            fill
                            className="object-cover"
                            sizes="48px"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                      )}
                      <button
                        onClick={() => handleSaveImage(cat.id)}
                        disabled={savingId === cat.id || !draftUrl}
                        className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {savingId === cat.id ? "…" : "✓"}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setDraftUrl(""); }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {savedId === cat.id && (
                        <span className="text-xs font-medium text-green-600">✓ Sauvegardé</span>
                      )}
                      <button
                        onClick={() => {
                          setEditingId(cat.id);
                          setDraftUrl(cat.cover_image_url ?? "");
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        🖼 Modifier l&apos;image
                      </button>
                      <Link
                        href={`/search/${cat.slug}`}
                        target="_blank"
                        className="text-xs text-blue-500 hover:underline"
                      >
                        ↗ Voir
                      </Link>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
