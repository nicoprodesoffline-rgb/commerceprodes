import type { DevisRequest } from "lib/supabase/types";

const config: Record<
  DevisRequest["status"],
  { label: string; bg: string; text: string }
> = {
  nouveau: { label: "Nouveau", bg: "bg-blue-100", text: "text-blue-700" },
  en_cours: { label: "En cours", bg: "bg-orange-100", text: "text-orange-700" },
  traite: { label: "Traité", bg: "bg-green-100", text: "text-green-700" },
  archive: { label: "Archivé", bg: "bg-gray-100", text: "text-gray-600" },
  refuse: { label: "Refusé", bg: "bg-red-100", text: "text-red-700" },
};

export default function StatusBadge({
  status,
}: {
  status: DevisRequest["status"];
}) {
  const { label, bg, text } = config[status] ?? config.nouveau;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}
    >
      {label}
    </span>
  );
}
