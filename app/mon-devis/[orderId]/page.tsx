import Link from "next/link";
import Footer from "components/layout/footer";

export const metadata = { title: "Suivi de commande — PRODES" };

const STEPS = [
  { key: "received", label: "Demande reçue", icon: "✅", statuses: ["pending", "contacted", "confirmed"] },
  { key: "processing", label: "En traitement", icon: "🔄", statuses: ["pending"] },
  { key: "contacted", label: "Vous avez été contacté", icon: "📧", statuses: ["contacted", "confirmed"] },
  { key: "confirmed", label: "Commande confirmée", icon: "✅", statuses: ["confirmed"] },
];

async function getOrder(orderId: string) {
  try {
    const { supabaseServer } = await import("lib/supabase/client");
    const client = supabaseServer();
    const { data } = await client
      .from("devis_requests")
      .select("id, status, created_at, name, items_json, total_ht")
      .eq("id", orderId)
      .single();
    return data;
  } catch {
    return null;
  }
}

export default async function DevisStatusPage(props: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await props.params;
  const order = await getOrder(orderId);

  if (!order) {
    return (
      <>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mb-4 text-4xl">🔍</div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Commande introuvable</h1>
          <p className="mb-6 text-sm text-gray-500">
            Vérifiez le lien reçu par email ou contactez-nous.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center rounded-md bg-[#cc1818] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            Contacter PRODES
          </Link>
        </div>
        <Footer />
      </>
    );
  }

  const status = (order as any).status as string;
  const createdAt = new Date((order as any).created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <div className="mx-auto max-w-xl px-4 py-10">
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-gray-500">
          <Link href="/" className="hover:text-[#cc1818] transition-colors">Accueil</Link>
          <span>/</span>
          <span className="text-gray-800">Suivi de commande</span>
        </nav>

        <h1 className="mb-1 text-2xl font-bold text-gray-900">Suivi de commande</h1>
        <p className="mb-6 text-sm text-gray-500">
          Référence : <span className="font-mono font-semibold text-gray-800">{(order as any).id.slice(0, 8).toUpperCase()}</span>
          {" · "} Passée le {createdAt}
        </p>

        {/* Timeline */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const isActive = step.statuses.includes(status);
              const isLast = i === STEPS.length - 1;
              return (
                <div key={step.key} className="flex gap-4">
                  {/* Icône + ligne */}
                  <div className="flex flex-col items-center">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                      isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                    }`}>
                      {step.icon}
                    </div>
                    {!isLast && (
                      <div className={`my-1 w-0.5 flex-1 ${
                        isActive && STEPS[i + 1]?.statuses.includes(status)
                          ? "bg-green-300"
                          : "bg-gray-200"
                      }`} style={{ minHeight: "24px" }} />
                    )}
                  </div>
                  {/* Label */}
                  <div className="pb-5">
                    <p className={`text-sm font-medium ${isActive ? "text-gray-900" : "text-gray-400"}`}>
                      {step.label}
                    </p>
                    {step.key === "received" && (
                      <p className="text-xs text-gray-400">{createdAt}</p>
                    )}
                    {step.key === "processing" && status === "pending" && (
                      <p className="text-xs text-orange-600">Notre équipe traite votre demande</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/devis-express?ref=${(order as any).id}`}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
          >
            Refaire une commande similaire
          </Link>
          <Link
            href="/contact"
            className="flex-1 rounded-md bg-[#cc1818] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
          >
            Contacter PRODES
          </Link>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
          📞 <a href="tel:+33467243034" className="hover:text-[#cc1818]">04 67 24 30 34</a>
          {" · "}
          ✉️ <a href="mailto:contact@prodes.fr" className="hover:text-[#cc1818]">contact@prodes.fr</a>
          <p className="mt-1 text-xs text-gray-400">Lun–Sam 8h30–19h</p>
        </div>
      </div>
      <Footer />
    </>
  );
}
