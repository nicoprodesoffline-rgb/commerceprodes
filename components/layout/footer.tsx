import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#1f2937] text-white">
      {/* Main footer grid */}
      <div className="mx-auto max-w-(--breakpoint-2xl) px-6 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {/* Gauche — Logo + baseline */}
          <div>
            <Link href="/" aria-label="PRODES — Accueil">
              <Image
                src="/logo-prodes.png"
                alt="PRODES"
                width={130}
                height={44}
                style={{ objectFit: "contain", height: "44px", width: "auto" }}
              />
            </Link>
            <p className="mt-3 text-sm text-neutral-300">
              Au service des Collectivités
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Mobilier, signalisation et équipements pour les organismes publics.
            </p>
          </div>

          {/* Centre — Liens rapides */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#cc1818]">
              Liens rapides
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-neutral-300 hover:text-[#cc1818] transition-colors">
                  Catalogue
                </Link>
              </li>
              <li>
                <Link href="/panier" className="text-neutral-300 hover:text-[#cc1818] transition-colors">
                  Panier
                </Link>
              </li>
            </ul>
          </div>

          {/* Droite — Contacts */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#cc1818]">
              Nous contacter
            </h3>
            <ul className="space-y-3 text-sm text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5">📞</span>
                <div>
                  <a href="tel:+33467243034" className="hover:text-white transition-colors">
                    04 67 24 30 34
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">✉️</span>
                <div>
                  <a href="mailto:contact@prodes.fr" className="hover:text-white transition-colors">
                    contact@prodes.fr
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">🕐</span>
                <div>
                  <p>Lun–Sam 8h30–19h</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-800 bg-[#111827] py-5">
        <div className="mx-auto flex max-w-(--breakpoint-2xl) flex-col items-center justify-between gap-2 px-6 text-xs text-neutral-500 md:flex-row">
          <p>© 2026 PRODES — Prix HT — TVA et port non qualifiés dans ce spike</p>
          <p>Marque PRODES — France</p>
        </div>
      </div>
    </footer>
  );
}
