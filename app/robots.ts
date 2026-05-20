import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-seo";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/poster/",
        "/catalog/",
        "/meta/",
        "/logo/",
        "/backdrop/",
        "/demo/",
        "/health",
        "/manifest.json",
        "/manifest.full.json",
      ],
    },
    sitemap: new URL("/sitemap.xml", base).href,
    host: base.origin,
  };
}
