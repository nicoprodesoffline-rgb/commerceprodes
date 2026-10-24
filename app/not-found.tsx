import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-12">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-ink-2">Cette adresse ne correspond à aucune page ni à aucun article du catalogue publié.</p>
      <Link href="/" className="mt-4 inline-flex h-[42px] items-center rounded-[9px] bg-ink px-4 font-medium text-white">Retour au catalogue</Link>
    </div>
  );
}
