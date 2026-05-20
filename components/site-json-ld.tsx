import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site-seo";

export function SiteJsonLd() {
  const url = siteUrl().origin;
  const payload = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url,
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description: SITE_DESCRIPTION,
        url,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  };

  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
      type="application/ld+json"
    />
  );
}
