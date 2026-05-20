import Link from "next/link";

import { SiteSupportLinks } from "@/components/site-support-links";

export function PageFooter() {
  return (
    <footer className="mt-auto border-t border-white/5 px-6 py-8 text-xs text-zinc-600">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
        <Link
          className="text-cyan-700/90 underline decoration-zinc-700 underline-offset-2 hover:text-cyan-500"
          href="https://stremio.github.io/stremio-addon-sdk/testing.html#how-to-install-addon-in-stremio"
          rel="noopener noreferrer"
          target="_blank"
        >
          Stremio: install addon from URL
        </Link>
        <SiteSupportLinks />
      </div>
    </footer>
  );
}
