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
    "/api/listings/route": [
      "./node_modules/rets-client/**/*",
      "./node_modules/node-expat/**/*",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/bindings/**/*",
    ],
    "/api/listings/[mlsId]/route": [
      "./node_modules/rets-client/**/*",
      "./node_modules/node-expat/**/*",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/bindings/**/*",
    ],
    "/api/listings/[mlsId]/photo/route": [
      "./node_modules/rets-client/**/*",
      "./node_modules/node-expat/**/*",
      "./node_modules/bindings/**/*",
    ],
    "/api/listings/[mlsId]/photos/[photoIndex]/route": [
      "./node_modules/rets-client/**/*",
      "./node_modules/node-expat/**/*",
      "./node_modules/bindings/**/*",
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
