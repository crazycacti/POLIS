const linkClass = "text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-white";

export function PageFooter() {
  return (
    <footer className="border-t border-white/5 px-4 py-8 text-xs text-zinc-400 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-1">
        <a
          aria-label="The Movie Database"
          className="mb-2 inline-flex w-fit"
          href="https://www.themoviedb.org"
          rel="noopener noreferrer"
          target="_blank"
        >
          <img alt="" className="h-2.5 w-auto opacity-80" height={10} src="/legal/tmdb-short.svg" width={77} />
        </a>
        <p>
          This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by{" "}
          <a className={linkClass} href="https://www.themoviedb.org" rel="noopener noreferrer" target="_blank">
            TMDB
          </a>
          .
        </p>
        <p>
          Metadata provided by{" "}
          <a className={linkClass} href="https://thetvdb.com" rel="noopener noreferrer" target="_blank">
            TheTVDB
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
