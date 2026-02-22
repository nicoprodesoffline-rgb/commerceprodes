'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

type SearchResult = {
  id: string;
  title: string;
  handle: string;
  sku: string;
  featuredImageUrl: string | null;
  regularPrice: number | null;
};

function formatPriceFR(price: number | null): string {
  if (!price) return 'Sur devis';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(price) + ' € HT';
}

export function LiveSearch({ placeholder }: { placeholder?: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=8`,
        );
        const { results: data } = await res.json();
        setResults(data ?? []);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleResultClick = () => {
    setIsOpen(false);
    setQuery('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setIsOpen(false);
      window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} role="search">
        <div className="relative flex items-center">
          <svg
            className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.15 10.15z"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? 'Rechercher un produit, une référence...'}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-[#cc1818] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#cc1818] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setIsOpen(false); inputRef.current?.focus(); }}
              className="absolute right-3 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[400px] overflow-y-auto rounded-b-lg border border-gray-200 bg-white shadow-lg">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <svg className="h-5 w-5 animate-spin text-[#cc1818]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Aucun résultat pour &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((result) => (
              <Link
                key={result.id}
                href={`/product/${result.handle}`}
                onClick={handleResultClick}
                className="flex items-center gap-3 border-b border-gray-100 p-3 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <div className="h-12 w-12 flex-none overflow-hidden rounded bg-gray-100">
                  {result.featuredImageUrl ? (
                    <Image
                      src={result.featuredImageUrl}
                      alt={result.title}
                      width={48}
                      height={48}
                      className="h-full w-full object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 5h16v14H4V5zm2 2v10h12V7H6z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {result.title}
                  </div>
                  <div className="text-xs text-gray-500">Réf : {result.sku}</div>
                </div>
                <div className="flex-none text-sm font-bold text-gray-900 whitespace-nowrap">
                  {formatPriceFR(result.regularPrice)}
                </div>
              </Link>
            ))
          )}

          {/* Footer */}
          <Link
            href={`/search?q=${encodeURIComponent(query)}`}
            onClick={handleResultClick}
            className="block border-t border-gray-200 p-3 text-center text-sm font-medium text-[#cc1818] hover:bg-red-50 transition-colors"
          >
            Voir tous les résultats →
          </Link>
        </div>
      )}
    </div>
  );
}
