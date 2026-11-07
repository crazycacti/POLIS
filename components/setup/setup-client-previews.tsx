"use client";

export type ClientPreviewView = "poster" | "phone" | "resume" | "tv";

const VIEWS: { id: ClientPreviewView; label: string }[] = [
  { id: "poster", label: "Full size" },
  { id: "phone", label: "Phone row" },
  { id: "resume", label: "Continue watching" },
  { id: "tv", label: "TV row" },
];

const PHONE_TILE_PX = 120;
const RESUME_TILE_PX = 132;
const TV_TILE_PX = 136;
const RESUME_PROGRESS = 0.62;

export function ClientPreviewTabs(props: {
  value: ClientPreviewView;
  onChange: (view: ClientPreviewView) => void;
}) {
  return (
    <div aria-label="Preview as" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-900 p-1" role="group">
      {VIEWS.map((view) => {
        const selected = props.value === view.id;
        return (
          <button
            aria-pressed={selected}
            className={`min-h-9 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
              selected ? "bg-cyan-500/20 text-white" : "text-zinc-400 hover:bg-white/5"
            }`}
            key={view.id}
            onClick={() => props.onChange(view.id)}
            type="button"
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

function NeighborTile(props: { width: number; src?: string; dim?: boolean }) {
  if (!props.src) {
    return (
      <div
        aria-hidden
        className={`aspect-2/3 shrink-0 rounded-md bg-zinc-800/80 ${props.dim ? "opacity-50" : ""}`}
        style={{ width: props.width }}
      />
    );
  }
  return (
    <img
      alt=""
      aria-hidden
      className={`aspect-2/3 shrink-0 rounded-md object-cover ${props.dim ? "opacity-50" : ""}`}
      decoding="async"
      loading="lazy"
      src={props.src}
      style={{ width: props.width }}
    />
  );
}

export function ClientPreview(props: {
  view: Exclude<ClientPreviewView, "poster">;
  src: string;
  neighborSrcs?: string[];
}) {
  const [first, second] = props.neighborSrcs ?? [];
  if (props.view === "phone") {
    return (
      <div className="flex items-start gap-2 overflow-hidden rounded-lg bg-black px-3 py-4">
        <img
          alt="Poster at phone row size"
          className="aspect-2/3 shrink-0 rounded-md object-cover"
          src={props.src}
          style={{ width: PHONE_TILE_PX }}
        />
        <NeighborTile src={first} width={PHONE_TILE_PX} />
        <NeighborTile src={second} width={PHONE_TILE_PX} />
      </div>
    );
  }

  if (props.view === "resume") {
    return (
      <div className="flex items-start gap-2 overflow-hidden rounded-lg bg-black px-3 py-4">
        <div className="relative shrink-0 overflow-hidden rounded-md" style={{ width: RESUME_TILE_PX }}>
          <img alt="Poster as a Continue Watching card" className="aspect-2/3 w-full object-cover" src={props.src} />
          <span aria-hidden className="absolute right-1.5 top-1.5 h-3.5 w-7 rounded-sm bg-black/70" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <div className="h-full bg-cyan-400" style={{ width: `${RESUME_PROGRESS * 100}%` }} />
          </div>
        </div>
        <NeighborTile src={first} width={RESUME_TILE_PX} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4 overflow-hidden rounded-lg bg-zinc-900 py-6">
      <NeighborTile dim src={first} width={TV_TILE_PX * 0.8} />
      <img
        alt="Poster focused in a TV row"
        className="aspect-2/3 shrink-0 scale-110 rounded-lg object-cover shadow-2xl shadow-black/70 ring-2 ring-white/90"
        src={props.src}
        style={{ width: TV_TILE_PX }}
      />
      <NeighborTile dim src={second} width={TV_TILE_PX * 0.8} />
    </div>
  );
}
