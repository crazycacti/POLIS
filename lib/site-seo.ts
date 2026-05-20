import type { Metadata } from "next";

export const SITE_NAME = "POLIS";

export const SITE_DESCRIPTION =
  "Self-hosted poster overlays for Aurora Media Center and Stremio. Ratings, trend labels, and quality badges on your library art. Addon URLs and AIOMetadata patterns supported.";

export function siteUrl(): URL {
  const raw = process.env.POLIS_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (raw) {
    try {
      return new URL(`${raw}/`);
    } catch {
    }
  }
  return new URL("http://localhost:3050/");
}

export const rootMetadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: `${SITE_NAME} | Poster overlays for Aurora and Stremio`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Poster overlays for Aurora and Stremio`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} | Poster overlays for Aurora and Stremio`,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: "/",
  },
};

export const setupPageMetadata: Metadata = {
  title: "Setup",
  description:
    "Configure API keys, overlay options, and catalogs. Copy your addon install URL or AIOMetadata art patterns for Aurora and Stremio.",
  alternates: {
    canonical: "/configure",
  },
  openGraph: {
    title: `Setup | ${SITE_NAME}`,
    description:
      "Configure API keys, overlay options, and catalogs. Copy your addon install URL or AIOMetadata art patterns for Aurora and Stremio.",
    url: "/configure",
  },
};

export const configurePageMetadata: Metadata = {
  title: "Configure",
  description:
    "Configure API keys, overlay options, and catalogs. Save your profile with a password and install the Stremio addon.",
  alternates: {
    canonical: "/configure",
  },
  openGraph: {
    title: `Configure | ${SITE_NAME}`,
    description:
      "Configure API keys, overlay options, and catalogs. Save your profile with a password and install the Stremio addon.",
    url: "/configure",
  },
};
