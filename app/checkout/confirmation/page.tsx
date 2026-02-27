import Link from "next/link";
import Footer from "components/layout/footer";
import { ClearCartOnMount } from "./clear-cart";

export const metadata = {
  title: "Confirmation de commande — PRODES",
};

export default async function ConfirmationPage(props: {
  searchParams: Promise<{ orderId?: string; mode?: string }>;
}) {
  const { orderId, mode } = await props.searchParams;

  const modeMessages: Record<string, { title: string; body: string; cta?: string }> = {
    virement: {
      title: "Commande enregistrée !",
      body: "Un email de confirmation vous a été envoyé avec les coordonnées bancaires pour effectuer votre virement. Votre commande sera traitée dès réception du paiement.",
    },
    cheque: {
      title: "Commande enregistrée !",
      body: "Un email de confirmation vous a été envoyé. Merci d'envoyer votre chèque à l'ordre de PRODES dans les 7 jours. Votre commande sera traitée à réception.",
    },
    mandat: {
      title: "Commande enregistrée !",
      body: "Téléchargez et renvoyez le bon de commande signé pour finaliser votre commande. Votre commande ne sera pas traitée sans ce document.",
      cta: "Télécharger le bon de commande",
    },
    carte: {
      title: "Demande enregistrée",
      body: "Le paiement en ligne par carte sera disponible prochainement. Notre équipe vous contactera pour finaliser votre commande.",
    },
  };

  const info = modeMessages[mode ?? "virement"] ?? modeMessages["virement"]!;

  return (
    <>
      <ClearCartOnMount />
      <div className="mx-auto max-w-screen-2xl px-4 py-16 text-center lg:px-6">
        <div className="mx-auto max-w-md">
          {/* Icône succès */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">{info.title}</h1>

          {orderId && (
            <p className="mt-2 text-sm font-mono text-gray-500">
              Référence : <span className="font-semibold text-gray-800">{orderId}</span>
            </p>
          )}

          <p className="mt-4 text-gray-600">{info.body}</p>

          {/* Bouton bon de commande pour mandat */}
          {mode === "mandat" && orderId && (
            <a
              href={`/api/checkout/bon-de-commande?orderId=${encodeURIComponent(orderId)}`}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Télécharger le bon de commande
            </a>
          )}

          {/* Contact */}
          <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800 mb-1">Une question ?</p>
            <p>
              📞 <a href="tel:+33467243034" className="hover:text-[#cc1818]">04 67 24 30 34</a>
              {" · "}
              ✉️ <a href="mailto:contact@prodes.fr" className="hover:text-[#cc1818]">contact@prodes.fr</a>
            </p>
            <p className="mt-1 text-xs text-gray-400">Lun–Sam 8h30–19h</p>
          </div>

          <Link
            href="/search"
            className="mt-8 inline-flex items-center rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-400 transition-colors"
          >
            ← Retourner à la boutique
          </Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
