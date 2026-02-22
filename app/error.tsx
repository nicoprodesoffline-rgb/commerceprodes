"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <p className="text-4xl">⚠️</p>
      <h2 className="mt-4 text-xl font-bold text-gray-900">
        Une erreur est survenue
      </h2>
      <p className="mt-2 text-gray-500 max-w-sm">
        Une erreur inattendue s&apos;est produite. Vous pouvez réessayer ou
        retourner à l&apos;accueil.
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
