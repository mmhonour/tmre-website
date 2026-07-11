import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn-cws.datafloat.com",
        pathname: "/BNE/images/company/BNE/logo/**",
      },
    ],
  },
  // Native addons must stay external so Netlify ships the Linux .node binaries.
  serverExternalPackages: ["rets-client", "node-expat", "better-sqlite3", "bindings"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/bindings/**/*",
      "./node_modules/file-uri-to-path/**/*",
      "./node_modules/rets-client/**/*",
      "./node_modules/node-expat/**/*",
      "./data/listings.bundle.db",
    ],
  },
  async redirects() {
    return [
      {
        source: "/properties",
        destination: "/new-construction",
        permanent: true,
      },
      {
        source: "/spotlight.html",
        destination: "/spotlight",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
