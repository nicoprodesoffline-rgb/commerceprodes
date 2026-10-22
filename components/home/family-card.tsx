import Link from "next/link";

/** Carte Famille : jamais achetable directement (lien vers la fiche). */
export function FamilyCard({
  slug,
  name,
  description,
  imageSha,
  itemCount,
}: {
  slug: string;
  name: string;
  description: string;
  imageSha: string | null;
  itemCount: number;
}) {
  return (
    <Link
      href={`/famille/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-[#cc1818] hover:shadow-md"
    >
      {imageSha ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${imageSha}`} alt={`Image de la famille ${name}`} className="aspect-[4/3] w-full bg-gray-100 object-contain [image-rendering:pixelated]" />
      ) : (
        <div className="aspect-[4/3] w-full bg-gray-100" aria-hidden="true" />
      )}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 group-hover:text-[#cc1818]">{name}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
        <p className="mt-2 text-xs text-gray-500">
          {itemCount} article{itemCount > 1 ? "s" : ""} publié{itemCount > 1 ? "s" : ""} · voir la fiche
        </p>
      </div>
    </Link>
  );
}
