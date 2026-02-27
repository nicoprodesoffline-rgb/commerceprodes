"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Testimonial {
  id: string;
  author: string;
  role: string | null;
  content: string;
  rating: number;
  active: boolean;
  created_at: string;
}

export default function AdminContenuPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [newT, setNewT] = useState({ author: "", role: "", content: "", rating: 5 });
  const [addingT, setAddingT] = useState(false);

  const password =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin_password") ?? ""
      : "";

  const authH = { Authorization: `Bearer ${password}` };

  useEffect(() => {
    fetch("/api/admin/site-config", { headers: authH })
      .then((r) => r.json())
      .then((d) => setConfig(d.config ?? {}));
    fetchTestimonials();
  }, []);

  const fetchTestimonials = () => {
    fetch("/api/admin/testimonials", { headers: authH })
      .then((r) => r.json())
      .then((d) => setTestimonials(d.testimonials ?? []));
  };

  const saveConfig = async (key: string, value: string) => {
    setSaving(key);
    const res = await fetch("/api/admin/site-config", {
      method: "PATCH",
      headers: { ...authH, "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSaving(null);
    if (res.ok) toast.success("Enregistré !");
    else toast.error("Erreur lors de l'enregistrement");
  };

  const toggleTestimonial = async (t: Testimonial) => {
    const res = await fetch(`/api/admin/testimonials/${t.id}`, {
      method: "PATCH",
      headers: { ...authH, "Content-Type": "application/json" },
      body: JSON.stringify({ active: !t.active }),
    });
    if (res.ok) {
      setTestimonials((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)),
      );
    }
  };

  const addTestimonial = async () => {
    if (!newT.author || !newT.content) {
      toast.error("Auteur et contenu requis");
      return;
    }
    setAddingT(true);
    const res = await fetch("/api/admin/testimonials", {
      method: "POST",
      headers: { ...authH, "Content-Type": "application/json" },
      body: JSON.stringify(newT),
    });
    setAddingT(false);
    if (res.ok) {
      toast.success("Témoignage ajouté !");
      setNewT({ author: "", role: "", content: "", rating: 5 });
      fetchTestimonials();
    } else {
      toast.error("Erreur ajout témoignage");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#cc1818] focus:outline-none focus:ring-1 focus:ring-[#cc1818]";

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-900">Gestion du contenu</h1>

      {/* Bandeau promotionnel */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-gray-900">📢 Bandeau promotionnel</h2>

        {/* Aperçu */}
        {config.promo_banner_active === "true" && config.promo_banner_text && (
          <div className="mb-4 rounded bg-[#cc1818] px-4 py-2 text-center text-sm font-medium text-white">
            {config.promo_banner_text}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 font-medium">Actif</span>
            <button
              onClick={() => {
                const v = config.promo_banner_active === "true" ? "false" : "true";
                setConfig((c) => ({ ...c, promo_banner_active: v }));
                saveConfig("promo_banner_active", v);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.promo_banner_active === "true" ? "bg-[#cc1818]" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config.promo_banner_active === "true" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Texte (max 120 caractères)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={120}
                value={config.promo_banner_text ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, promo_banner_text: e.target.value }))}
                className={inputClass}
              />
              <button
                onClick={() => saveConfig("promo_banner_text", config.promo_banner_text ?? "")}
                disabled={saving === "promo_banner_text"}
                className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {saving === "promo_banner_text" ? "…" : "Enregistrer"}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {(config.promo_banner_text ?? "").length}/120 caractères
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Lien (optionnel)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.promo_banner_link ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, promo_banner_link: e.target.value }))}
                placeholder="/devis-express"
                className={inputClass}
              />
              <button
                onClick={() => saveConfig("promo_banner_link", config.promo_banner_link ?? "")}
                disabled={saving === "promo_banner_link"}
                className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {saving === "promo_banner_link" ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Informations de contact */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-gray-900">📞 Informations de contact</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { key: "contact_phone", label: "Téléphone", placeholder: "04 67 24 30 34" },
            { key: "contact_email", label: "Email", placeholder: "contact@prodes.fr" },
            { key: "contact_address", label: "Adresse", placeholder: "PRODES — 34000 Montpellier" },
            { key: "contact_hours", label: "Horaires", placeholder: "Lun–Sam 8h30–19h" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config[key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={inputClass}
                />
                <button
                  onClick={() => saveConfig(key, config[key] ?? "")}
                  disabled={saving === key}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60 transition-colors"
                >
                  {saving === key ? "…" : "✓"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Témoignages */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-gray-900">⭐ Témoignages</h2>

        {/* Liste */}
        <div className="mb-6 space-y-3">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                t.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{t.author}</span>
                  {t.role && <span className="text-xs text-gray-400">{t.role}</span>}
                  <span className="text-xs text-amber-400">{"★".repeat(t.rating)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{t.content}</p>
              </div>
              <button
                onClick={() => toggleTestimonial(t)}
                className={`flex-none rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  t.active
                    ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                    : "bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-700"
                }`}
              >
                {t.active ? "Visible" : "Masqué"}
              </button>
            </div>
          ))}
          {testimonials.length === 0 && (
            <p className="text-sm text-gray-400">Aucun témoignage. La table Supabase doit être créée (008-site-config.sql).</p>
          )}
        </div>

        {/* Ajouter */}
        <div className="rounded-lg border border-dashed border-gray-300 p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Ajouter un témoignage</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Auteur *" value={newT.author}
                onChange={(e) => setNewT((p) => ({ ...p, author: e.target.value }))}
                className={inputClass} />
              <input type="text" placeholder="Fonction / Organisme" value={newT.role}
                onChange={(e) => setNewT((p) => ({ ...p, role: e.target.value }))}
                className={inputClass} />
            </div>
            <textarea rows={3} placeholder="Témoignage *" value={newT.content}
              onChange={(e) => setNewT((p) => ({ ...p, content: e.target.value }))}
              className={inputClass} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Note :</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setNewT((p) => ({ ...p, rating: n }))}
                    className={`text-lg ${n <= newT.rating ? "text-amber-400" : "text-gray-300"}`}>
                    ★
                  </button>
                ))}
              </div>
              <button onClick={addTestimonial} disabled={addingT}
                className="rounded-lg bg-[#cc1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa1414] disabled:opacity-60 transition-colors">
                {addingT ? "…" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
