export default function SearchLoading() {
  return (
    <div className="space-y-6">
      <div aria-hidden="true" className="h-8 w-64 max-w-full rounded bg-gray-200" />
      <p role="status" className="sr-only">Chargement des résultats…</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} aria-hidden="true" className="h-72 rounded-[14px] bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
