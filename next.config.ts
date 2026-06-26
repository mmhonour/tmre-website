import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["rets-client", "node-expat"],
};

export default nextConfig;
