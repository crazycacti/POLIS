import Link from "next/link";

import { PolisLogo } from "@/components/polis-logo";
import { SiteSupportLinks } from "@/components/site-support-links";

export function SiteNav() {
  return (
    <nav className="border-b border-white/10 bg-black/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:gap-6 sm:px-6">
        <Link
          className="min-w-0 max-w-[calc(100%-5rem)] shrink transition-opacity hover:opacity-90 sm:max-w-none"
          href="/"
        >
          <PolisLogo
            className="h-6 w-[7rem] sm:h-7 sm:w-[8.75rem]"
            colorClassName="text-white"
          />
        </Link>
        <SiteSupportLinks className="shrink-0" />
      </div>
    </nav>
  );
}
