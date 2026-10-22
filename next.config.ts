import type { NextConfig } from "next";

// BC1-B : options expérimentales canary (ppr, inlineCss, useCache) retirées (E1).
// Images : uniquement locales (/public, /media/<sha256> de la fixture) ; aucun hôte
// distant. `unoptimized` supprime l'API d'optimisation d'images (/_next/image) :
// atténuation de GHSA-2464-fhr4-w9xw (RCE, next 16.0.0–16.4.0, version imposée).
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
