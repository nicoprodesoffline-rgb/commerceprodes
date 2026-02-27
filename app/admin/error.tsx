"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl">⚠️</div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          Erreur admin
        </h1>
        <p className="mb-1 text-sm text-gray-500">
          Une erreur est survenue dans l&apos;interface d&apos;administration.
        </p>
        {error?.digest && (
          <p className="mb-4 font-mono text-xs text-gray-400">#{error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            Réessayer
          </button>
          <a
            href="/admin"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Retour au dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
