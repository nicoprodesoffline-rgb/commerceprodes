import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <p className="text-6xl font-bold text-blue-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        Page introuvable
      </h1>
      <p className="mt-2 text-gray-500 max-w-sm">
        La page que vous recherchez n&apos;existe pas ou a été déplacée.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Accueil
        </Link>
        <Link
          href="/search"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Voir le catalogue
        </Link>
      </div>
    </div>
  );
}
