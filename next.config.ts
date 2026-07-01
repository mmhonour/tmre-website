import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["rets-client", "node-expat", "better-sqlite3"],
  async redirects() {
    return [
      {
        source: "/properties",
        destination: "/new-construction",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
