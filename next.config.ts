import type { NextConfig } from "next";

const sqliteNativeIncludes = [
  "./node_modules/better-sqlite3/**/*",
  "./node_modules/bindings/**/*",
  "./node_modules/file-uri-to-path/**/*",
  "./node_modules/node-addon-api/**/*",
  "./data/listings.bundle.db",
];

const retsNativeIncludes = [
  "./node_modules/rets-client/**/*",
  "./node_modules/node-expat/**/*",
  ...sqliteNativeIncludes,
];

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
    "/**": sqliteNativeIncludes,
    "/admin": sqliteNativeIncludes,
    "/api/**/*": retsNativeIncludes,
    "/api/listings/route": retsNativeIncludes,
    "/api/listings/[mlsId]/route": retsNativeIncludes,
    "/api/listings/[mlsId]/photo/route": retsNativeIncludes,
    "/api/listings/[mlsId]/photos/[photoIndex]/route": retsNativeIncludes,
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
