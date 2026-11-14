import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @parrot/shared ships TypeScript source (exports "./src/index.ts"), so Next must compile it.
  transpilePackages: ["@parrot/shared"],
};

export default nextConfig;
