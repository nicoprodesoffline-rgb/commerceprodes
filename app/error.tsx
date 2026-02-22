'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="text-center max-w-md px-4">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Une erreur est survenue
        </h1>
        <p className="text-gray-600 mb-6">
          Nous avons été informés et allons corriger cela rapidement.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[#cc1818] text-white rounded-lg hover:bg-[#aa1414]"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </div>
  );
}
