import Link from "next/link";

import { PolisLogo } from "@/components/polis-logo";
import { DEMO_TITLES } from "@/lib/demo-catalog";
import { staticDemoPosterSrc } from "@/lib/demo-poster-static";

const POLIS_EXPANSION = "Poster Overlay Layer Integration Service";

export function LandingHero() {
  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-3.25rem)] max-w-3xl flex-col items-center justify-center px-6 py-16">
      <div className="polis-orb polis-orb-a" aria-hidden />
      <div className="polis-orb polis-orb-b" aria-hidden />

      <header className="polis-hero-heading text-center">
        <h1 className="sr-only">POLIS</h1>
        <PolisLogo
          aria-hidden
          className="polis-hero-title mx-auto h-auto w-[min(320px,80vw)]"
          colorClassName="text-white"
        />
        <p className="polis-hero-expansion mt-4 text-[0.65rem] font-medium uppercase leading-snug tracking-[0.2em] text-zinc-500 sm:text-xs sm:tracking-[0.24em]">
          {POLIS_EXPANSION}
        </p>
      </header>

      <p className="mt-6 max-w-lg text-center text-base leading-relaxed text-zinc-400 sm:text-lg">
        Poster overlays with ratings, trend labels, and quality badges for your library. Built for{" "}
        <a
          className="text-cyan-400/90 underline decoration-cyan-800/60 underline-offset-2 hover:text-cyan-300"
          href="https://auroramediacenter.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          Aurora Media Center
        </a>
        . Also works via addon URL or AIOMetadata in other players.
      </p>

      <Link className="polis-btn-glow mt-10 px-10 py-4 text-base" href="/configure">
        Configure
      </Link>

      <div className="mt-14 w-full">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
          Sample overlays
        </p>
        <div className="flex justify-center gap-3 overflow-x-auto pb-2">
          {DEMO_TITLES.map((demo) => (
            <div
              key={demo.id}
              className="polis-poster-frame w-[min(120px,22vw)] shrink-0 overflow-hidden rounded-lg"
            >
              <img
                alt={demo.title}
                className="h-auto w-full object-cover"
                decoding="async"
                fetchPriority="high"
                height={180}
                loading="eager"
                src={staticDemoPosterSrc(demo.id)}
                width={120}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
