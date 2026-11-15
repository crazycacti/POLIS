import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();

  return [
    {
      url: new URL("/", base).href,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: new URL("/configure", base).href,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: new URL("/privacy", base).href,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
