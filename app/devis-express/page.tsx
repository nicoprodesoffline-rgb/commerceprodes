'use client';

import { useState } from 'react';
import Footer from 'components/layout/footer';

export default function DevisExpressPage() {
  const [submitted, setSubmitted] = useState(false);
  const [devisId, setDevisId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    organisme: '',
    email: '',
    phone: '',
    type_product: '',
    description: '',
    quantite: '',
    budget: '',
    delai: '',
    num_marche: '',
    consent: false,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.consent) {
      setError('Veuillez accepter les conditions avant de soumettre.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/devis-express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Une erreur est survenue. Réessayez.');
      } else {
        setDevisId(data.id ?? '');
        setSubmitted(true);
      }
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818] transition-colors';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-12">
        {/* En-tête */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#cc1818] px-4 py-1.5 text-sm font-semibold text-white">
            Réponse sous 24h
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Devis express</h1>
          <p className="mt-3 text-base text-gray-600">
            Vous cherchez un produit pour votre collectivité ?<br />
            Décrivez votre besoin, nous vous envoyons un devis personnalisé rapidement.
          </p>
        </div>

        {submitted ? (
          /* Confirmation */
          <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
            <div className="mb-4 text-5xl">✅</div>
            <h2 className="mb-2 text-xl font-bold text-gray-900">
              Demande envoyée !
            </h2>
            <p className="text-gray-600">
              Nous revenons vers vous sous 24h.
            </p>
            {devisId && (
              <p className="mt-3 text-sm text-gray-500">
                Référence de votre demande :{' '}
                <span className="font-mono font-medium text-gray-700">{devisId}</span>
              </p>
            )}
            <a
              href="/search"
              className="mt-6 inline-flex items-center rounded-lg bg-[#cc1818] px-6 py-3 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
            >
              Retourner au catalogue
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Vos coordonnées */}
            <fieldset className="rounded-xl border border-gray-200 bg-white p-6">
              <legend className="px-2 text-sm font-semibold text-gray-900">
                Vos coordonnées
              </legend>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className={labelClass}>
                      Prénom / Nom <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Marie Dupont"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="organisme" className={labelClass}>
                      Organisme / Collectivité <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="organisme"
                      name="organisme"
                      type="text"
                      required
                      value={form.organisme}
                      onChange={handleChange}
                      placeholder="Mairie de..."
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="email" className={labelClass}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="marie@mairie.fr"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className={labelClass}>
                      Téléphone <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      required
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="04 67 24 30 34"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Votre besoin */}
            <fieldset className="rounded-xl border border-gray-200 bg-white p-6">
              <legend className="px-2 text-sm font-semibold text-gray-900">
                Votre besoin
              </legend>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="type_product" className={labelClass}>
                    Type de produit
                  </label>
                  <select
                    id="type_product"
                    name="type_product"
                    value={form.type_product}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="">Choisir...</option>
                    <option value="Mobilier scolaire">Mobilier scolaire</option>
                    <option value="Mobilier de bureau">Mobilier de bureau</option>
                    <option value="Équipement sportif">Équipement sportif</option>
                    <option value="Mobilier urbain">Mobilier urbain</option>
                    <option value="Signalisation">Signalisation</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="description" className={labelClass}>
                    Description du besoin <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={4}
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Ex : 20 chaises empilables pour une salle de réunion, livraison avant le 15 mars..."
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="quantite" className={labelClass}>
                      Quantité approximative
                    </label>
                    <input
                      id="quantite"
                      name="quantite"
                      type="text"
                      value={form.quantite}
                      onChange={handleChange}
                      placeholder="Ex : 20"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="budget" className={labelClass}>
                      Budget indicatif
                    </label>
                    <select
                      id="budget"
                      name="budget"
                      value={form.budget}
                      onChange={handleChange}
                      className={inputClass}
                    >
                      <option value="">Non renseigné</option>
                      <option value="< 1 000 €">&lt; 1 000 €</option>
                      <option value="1 000 – 5 000 €">1 000 – 5 000 €</option>
                      <option value="5 000 – 20 000 €">5 000 – 20 000 €</option>
                      <option value="> 20 000 €">&gt; 20 000 €</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="delai" className={labelClass}>
                      Délai souhaité
                    </label>
                    <select
                      id="delai"
                      name="delai"
                      value={form.delai}
                      onChange={handleChange}
                      className={inputClass}
                    >
                      <option value="Non urgent">Non urgent</option>
                      <option value="Sous 1 mois">Sous 1 mois</option>
                      <option value="Sous 2 semaines">Sous 2 semaines</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Référence marché (optionnel) */}
            <fieldset className="rounded-xl border border-gray-200 bg-white p-6">
              <legend className="px-2 text-sm font-semibold text-gray-900">
                Référence marché{' '}
                <span className="font-normal text-gray-500">(optionnel)</span>
              </legend>
              <div className="mt-4">
                <label htmlFor="num_marche" className={labelClass}>
                  Numéro de marché public (MAPA, AO…)
                </label>
                <input
                  id="num_marche"
                  name="num_marche"
                  type="text"
                  value={form.num_marche}
                  onChange={handleChange}
                  placeholder="Ex : MAPA-2026-001"
                  className={inputClass}
                />
              </div>
            </fieldset>

            {/* Consentement */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="consent"
                checked={form.consent}
                onChange={handleChange}
                className="mt-0.5 h-4 w-4 flex-none rounded border-gray-300 text-[#cc1818] focus:ring-[#cc1818]"
              />
              <span className="text-sm text-gray-600">
                J&apos;accepte que PRODES conserve mes coordonnées pour traiter ma
                demande de devis.
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#cc1818] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Envoi en cours…
                </>
              ) : (
                'ENVOYER MA DEMANDE →'
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              Besoin urgent ? Appelez-nous directement :{' '}
              <a href="tel:+33467243034" className="font-medium text-gray-600 hover:text-[#cc1818]">
                04 67 24 30 34
              </a>
            </p>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
