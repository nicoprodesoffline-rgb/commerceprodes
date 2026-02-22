export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-12 lg:px-6">
      <div className="animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-200 mb-6" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  );
}
