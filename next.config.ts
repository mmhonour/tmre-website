import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addons must stay external so Netlify ships the Linux .node binaries.
  serverExternalPackages: ["rets-client", "node-expat", "better-sqlite3", "bindings"],
  outputFileTracingIncludes: {
    "/api/*": [
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
    ];
  },
};

export default nextConfig;
