import { Github, Heart } from "lucide-react";

import { POLIS_GITHUB_URL, POLIS_SUPPORT_URL } from "@/lib/site-links";

const iconLinkClass =
  "inline-flex shrink-0 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black max-sm:h-10 max-sm:w-10 sm:h-auto sm:w-auto";

type SiteSupportLinksProps = {
  className?: string;
};

export function SiteSupportLinks({ className = "" }: SiteSupportLinksProps) {
  return (
    <div className={`flex shrink-0 items-center gap-1 sm:gap-3 ${className}`.trim()}>
      <a
        aria-label="Support POLIS on Buy Me a Coffee"
        className={`${iconLinkClass} hover:text-rose-400`}
        href={POLIS_SUPPORT_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Heart aria-hidden className="h-4 w-4" strokeWidth={2} />
      </a>
      <a
        aria-label="POLIS on GitHub"
        className={iconLinkClass}
        href={POLIS_GITHUB_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Github aria-hidden className="h-4 w-4" strokeWidth={2} />
      </a>
    </div>
  );
}
