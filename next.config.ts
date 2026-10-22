import type { NextConfig } from "next";

// Spike BC1-D : aucune option expérimentale (ppr, useCache, inlineCss retirés).
// images.unoptimized : l'optimiseur d'images n'est pas utilisé (médias servis
// par /media/[sha256] depuis la fixture) — réduit aussi la surface GHSA-2464-fhr4-w9xw.
const config: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
