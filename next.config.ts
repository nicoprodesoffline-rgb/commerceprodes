export default {
  experimental: {
    ppr: true,
    inlineCss: true,
    useCache: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Supabase Storage (primary image source)
      {
        protocol: "https",
        hostname: "mvnaeddtvyaqkdliivdk.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // WordPress import (prodes.fr migrated images)
      {
        protocol: "https",
        hostname: "prodes.fr",
        pathname: "/wp-content/uploads/**",
      },
      // Admin-managed category images (any HTTPS source)
      {
        protocol: "https",
        hostname: "**",
      },
    ],
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
