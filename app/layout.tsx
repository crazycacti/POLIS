import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { DemoPosterPreload } from "@/components/demo-poster-preload";
import { SiteJsonLd } from "@/components/site-json-ld";
import { SiteNav } from "@/components/site-nav";
import { rootMetadata } from "@/lib/site-seo";

import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteIcons = {
  icon: [
    { url: "/favicon.png" },
    { url: "/favicon-light.png", media: "(prefers-color-scheme: light)" },
  ],
  apple: [{ url: "/apple-icon.png", type: "image/png" }],
} as const;

export const metadata = {
  ...rootMetadata,
  icons: siteIcons,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <SiteJsonLd />
        <DemoPosterPreload />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
