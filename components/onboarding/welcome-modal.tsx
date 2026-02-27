"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const BUYER_TYPES = [
  {
    id: "collectivite",
    icon: "🏛️",
    label: "Mairie / Collectivité",
    banner: "Paiement par mandat administratif · Compatible Chorus Pro",
    bannerClass: "bg-blue-700",
  },
  {
    id: "ecole",
    icon: "🏫",
    label: "École / Établissement",
    banner: "Tarifs dégressifs pour établissements · Devis gratuit 24h",
    bannerClass: "bg-green-700",
  },
  {
    id: "pro",
    icon: "🏗️",
    label: "Professionnel / Entreprise",
    banner: "Commandez en ligne ou demandez un devis personnalisé",
    bannerClass: "bg-gray-700",
  },
];

const PAGE_LIMIT = 3;

export function WelcomeModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const welcomed = localStorage.getItem("prodes_welcomed");
      if (!welcomed) {
        // Small delay to avoid layout shift
        const timer = setTimeout(() => setShow(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSelect = (typeId: string) => {
    try {
      localStorage.setItem("prodes_welcomed", "1");
      localStorage.setItem("prodes_buyer_type", typeId);
    } catch {
      // ignore
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShow(false)} />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="rounded-t-xl bg-[#cc1818] px-8 py-6 text-center">
          <div className="mb-3 flex justify-center">
            <Image
              src="/logo-prodes.png"
              alt="PRODES"
              width={120}
              height={36}
              className="object-contain brightness-0 invert"
            />
          </div>
          <h2 className="text-xl font-bold text-white">Bienvenue chez PRODES</h2>
          <p className="mt-1 text-sm text-red-100">
            Le spécialiste des équipements pour collectivités
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          <p className="mb-4 text-center text-sm font-medium text-gray-700">
            Vous êtes :
          </p>
          <div className="space-y-2.5">
            {BUYER_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => handleSelect(type.id)}
                className="flex w-full items-center gap-4 rounded-lg border border-gray-200 px-4 py-3.5 text-left transition-all hover:border-[#cc1818] hover:bg-red-50 hover:shadow-sm"
              >
                <span className="text-2xl">{type.icon}</span>
                <span className="font-medium text-gray-800">{type.label}</span>
                <span className="ml-auto text-gray-300">→</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShow(false)}
            className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Passer
          </button>
        </div>
      </div>
    </div>
  );
}

export function BuyerBanner() {
  const [banner, setBanner] = useState<{ text: string; cls: string } | null>(null);
  const [pagesViewed, setPagesViewed] = useState(0);

  useEffect(() => {
    try {
      const type = localStorage.getItem("prodes_buyer_type");
      const views = parseInt(localStorage.getItem("prodes_page_views") ?? "0");
      const newViews = views + 1;
      localStorage.setItem("prodes_page_views", String(newViews));

      if (newViews > PAGE_LIMIT) return; // hide after 3 page views

      const bt = BUYER_TYPES.find((t) => t.id === type);
      if (bt) {
        setBanner({ text: bt.banner, cls: bt.bannerClass });
        setPagesViewed(newViews);
      }
    } catch {
      // ignore
    }
  }, []);

  if (!banner || pagesViewed > PAGE_LIMIT) return null;

  return (
    <div className={`${banner.cls} px-4 py-2.5 text-center text-sm font-medium text-white`}>
      {banner.text}
    </div>
  );
}
