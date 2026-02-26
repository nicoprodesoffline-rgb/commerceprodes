import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales | PRODES",
  description:
    "Mentions légales du site prodes.fr — Informations éditeur, hébergement, propriété intellectuelle, données personnelles et cookies.",
};

export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Mentions légales</h1>

      <div className="prose prose-sm max-w-none text-gray-700 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Éditeur du site</h2>
          <p>
            <strong>Raison sociale :</strong> [À COMPLÉTER]<br />
            <strong>Adresse :</strong> [À COMPLÉTER]<br />
            <strong>SIRET :</strong> [À COMPLÉTER]<br />
            <strong>Directeur de publication :</strong> [À COMPLÉTER]<br />
            <strong>Email :</strong>{" "}
            <a href="mailto:contact@prodes.fr" className="text-[#cc1818] hover:underline">
              contact@prodes.fr
            </a><br />
            <strong>Téléphone :</strong>{" "}
            <a href="tel:+33467243034" className="text-[#cc1818] hover:underline">
              04 67 24 30 34
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Hébergement</h2>
          <p>
            Ce site est hébergé par :<br />
            <strong>Vercel Inc.</strong><br />
            340 Pine Street Suite 701<br />
            San Francisco, CA 94104<br />
            États-Unis<br />
            <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-[#cc1818] hover:underline">
              vercel.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble des contenus présents sur ce site (textes, images, logos, vidéos,
            photographies, illustrations) est la propriété exclusive de PRODES ou de ses
            partenaires. Toute reproduction, représentation, diffusion ou adaptation, totale ou
            partielle, de ces contenus sans autorisation écrite préalable de PRODES est
            strictement interdite et constitue une contrefaçon sanctionnée par le Code de la
            propriété intellectuelle.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Données personnelles</h2>
          <p>
            Conformément au Règlement Général sur la Protection des Données (RGPD — Règlement UE
            2016/679) et à la loi Informatique et Libertés modifiée, vous disposez des droits
            suivants concernant vos données personnelles :
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Droit d&apos;accès à vos données</li>
            <li>Droit de rectification</li>
            <li>Droit à l&apos;effacement (droit à l&apos;oubli)</li>
            <li>Droit à la portabilité</li>
            <li>Droit d&apos;opposition au traitement</li>
          </ul>
          <p className="mt-3">
            Pour exercer ces droits, adressez votre demande par email à{" "}
            <a href="mailto:contact@prodes.fr" className="text-[#cc1818] hover:underline">
              contact@prodes.fr
            </a>{" "}
            en précisant votre identité. Nous nous engageons à répondre dans un délai d&apos;un mois.
          </p>
          <p className="mt-2">
            Les données collectées (nom, email, téléphone, messages) sont utilisées uniquement pour
            le traitement de vos demandes et ne sont jamais cédées à des tiers à des fins
            commerciales.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Cookies</h2>
          <p>
            Ce site utilise des cookies techniques strictement nécessaires à son fonctionnement
            (gestion du panier, session utilisateur, préférences de navigation). Ces cookies ne
            collectent pas de données à des fins publicitaires ou de profilage.
          </p>
          <p className="mt-2">
            Aucun cookie tiers publicitaire ou de tracking n&apos;est utilisé sur ce site.
            Vous pouvez configurer votre navigateur pour refuser les cookies, mais certaines
            fonctionnalités du site pourraient ne plus être disponibles.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Éco-participation</h2>
          <p>
            Les montants d&apos;éco-participation affichés sur les fiches produit sont calculés
            conformément à la réglementation en vigueur relative aux filières de responsabilité
            élargie des producteurs (REP Mobiliers — REP Équipements électriques et électroniques).
            Ces montants sont fixés par les éco-organismes agréés et sont susceptibles d&apos;évoluer
            en cours d&apos;année.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Liens hypertextes</h2>
          <p>
            PRODES ne saurait être tenu responsable du contenu des sites externes vers lesquels
            ce site renvoie. La création de liens hypertextes pointant vers notre site est soumise
            à accord préalable.
          </p>
        </section>

        <p className="text-xs text-gray-400 border-t border-gray-100 pt-6">
          Dernière mise à jour : février 2026
        </p>
      </div>
    </div>
  );
}
