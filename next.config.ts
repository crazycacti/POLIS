import type { NextConfig } from "next";

import { DEV_INCOMING_REQUEST_IGNORE } from "./lib/dev-incoming-request-ignore";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  serverExternalPackages: ["sharp", "opentype.js"],
  // Runtime data and local secrets must never be copied into the standalone server bundle.
  outputFileTracingExcludes: {
    "/*": [".env*", "**/*.sqlite*", "data/**", ".cache/**", ".cursor/**"],
  },
  logging: {
    incomingRequests: {
      ignore: DEV_INCOMING_REQUEST_IGNORE,
    },
  },
  async headers() {
    // Profile ids in these paths act as access tokens, so they must never leave in a Referer header.
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/:configId([A-Za-z0-9_-]{12,48})/:path*", headers: noReferrer },
      { source: "/api/config/:path*", headers: noReferrer },
    ];
  },
  images: {
    localPatterns: [
      { pathname: "/demo-posters/**", search: "**" },
      { pathname: "/demo/poster/**", search: "**" },
      { pathname: "/poster/imdb/poster-default/**", search: "**" },
    ],
  },
};

export default nextConfig;
