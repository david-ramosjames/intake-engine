import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prisma must not be bundled — it's required at runtime by the server only.
  serverExternalPackages: ["@prisma/client", "prisma"],
  // The platform is multi-tenant by host. Images/assets may be served from
  // per-organization white-label domains and S3-compatible object storage.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    // Server Actions are used by the admin (Journey Builder) for autosave.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
