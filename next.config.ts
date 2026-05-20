import type { NextConfig } from "next";

import { DEV_INCOMING_REQUEST_IGNORE } from "./lib/dev-incoming-request-ignore";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "opentype.js"],
  logging: {
    incomingRequests: {
      ignore: DEV_INCOMING_REQUEST_IGNORE,
    },
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
