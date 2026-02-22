import { supabaseServer } from 'lib/supabase/client';
import Link from 'next/link';
import { AbandonedCartRow } from './abandoned-cart-row';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(amount) + ' € HT';
}

export default async function PaniersAbandonnesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const client = supabaseServer();

  const { data: carts, count, error } = await client
    .from('abandoned_carts')
    .select('*', { count: 'exact' })
    .is('recovered_at', null)
    .order('last_updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const totalPages = Math.ceil((count ?? 0) / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paniers abandonnés</h1>
          <p className="mt-1 text-sm text-gray-500">
            {count ?? 0} panier{(count ?? 0) > 1 ? 's' : ''} non récupéré
            {(count ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Retour au tableau de bord
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm text-orange-800">
            ⚠️ Table abandoned_carts introuvable. Créez-la dans Supabase via le SQL Editor.
          </p>
        </div>
      )}

      {!error && (!carts || carts.length === 0) ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="text-4xl mb-3">🛒</div>
          <p className="font-medium text-gray-700">Aucun panier abandonné</p>
          <p className="mt-1 text-sm text-gray-500">
            Les paniers non finalisés apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">
                  Produits
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Total HT</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(carts ?? []).map((cart: any) => {
                const items: { productTitle: string }[] = cart.items_json ?? [];
                const productList = items
                  .slice(0, 3)
                  .map((i) => i.productTitle)
                  .join(', ');
                const moreCount = items.length > 3 ? items.length - 3 : 0;

                const relanceText = `Bonjour,\n\nVous avez laissé des articles dans votre panier PRODES.\n\n${items.map((i: any) => `- ${i.productTitle} (×${i.quantity})`).join('\n')}\n\nTotal : ${formatPrice(cart.total_ht)}\n\nRetrouvez votre panier sur : https://prodes.fr\nBesoin d'un devis ? 04 67 24 30 34\n\nCordialement,\nL'équipe PRODES`;

                return (
                  <AbandonedCartRow
                    key={cart.id}
                    id={cart.id}
                    date={formatDate(cart.last_updated_at ?? cart.created_at)}
                    email={cart.email}
                    productList={productList}
                    moreCount={moreCount}
                    totalHt={formatPrice(cart.total_ht)}
                    relanceText={relanceText}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400"
              >
                ← Précédente
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?page=${page + 1}`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400"
              >
                Suivante →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
