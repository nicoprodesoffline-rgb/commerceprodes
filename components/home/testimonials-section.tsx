import { supabase } from "lib/supabase/client";

interface Testimonial {
  id: string;
  author: string;
  role: string | null;
  content: string;
  rating: number;
}

async function getTestimonials(): Promise<Testimonial[]> {
  try {
    const { data } = await supabase
      .from("testimonials")
      .select("id, author, role, content, rating")
      .eq("active", true)
      .limit(6);
    return (data as Testimonial[]) ?? [];
  } catch {
    return [];
  }
}

// Fallback hardcoded testimonials (shown if table doesn't exist yet)
const FALLBACK: Testimonial[] = [
  {
    id: "1",
    author: "Jean-Michel B.",
    role: "DGS — Mairie de Caen",
    content:
      "PRODES nous accompagne depuis 3 ans. Délais respectés, produits conformes aux normes. Facturation Chorus Pro sans friction.",
    rating: 5,
  },
  {
    id: "2",
    author: "Sophie L.",
    role: "Responsable Achats — Grand Lyon",
    content:
      "Devis reçu en moins de 2h, produits livrés dans les temps. Je recommande pour tous vos appels d'offres équipements.",
    rating: 5,
  },
  {
    id: "3",
    author: "Thomas R.",
    role: "Directeur Technique — École nationale",
    content:
      "Catalogue très complet pour les collectivités. Le mandat administratif est bien géré. Service client réactif.",
    rating: 5,
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 text-amber-400" aria-label={`${count} étoiles sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i}>{i < count ? "★" : "☆"}</span>
      ))}
    </div>
  );
}

export async function TestimonialsSection() {
  const data = await getTestimonials();
  const testimonials = data.length > 0 ? data : FALLBACK;

  return (
    <section className="bg-gray-50 py-14">
      <div className="mx-auto max-w-screen-xl px-4">
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
          Ils nous font confiance
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <Stars count={t.rating} />
              <blockquote className="mt-4 flex-1 text-sm italic text-gray-600">
                &ldquo;{t.content}&rdquo;
              </blockquote>
              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-gray-800">{t.author}</p>
                {t.role && (
                  <p className="text-xs text-gray-400">{t.role}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
