import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Page introuvable</h1>
      <p className="mt-2 text-gray-600">Cette page n&apos;existe pas dans le catalogue servi.</p>
      <Link href="/" className="mt-4 inline-block text-[#cc1818] underline">Retour au catalogue</Link>
    </div>
  );
}
