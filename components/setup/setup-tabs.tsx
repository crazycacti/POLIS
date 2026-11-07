"use client";

export type SetupTab = "style" | "catalogs" | "keys";

const TABS: { id: SetupTab; label: string }[] = [
  { id: "style", label: "Overlays" },
  { id: "catalogs", label: "Catalogs" },
  { id: "keys", label: "API keys" },
];

export function SetupTabs(props: { active: SetupTab; onChange: (tab: SetupTab) => void }) {
  return (
    <nav
      aria-label="Setup sections"
      className="mb-6 flex flex-wrap gap-2 border-b border-white/5 pb-4"
    >
      {TABS.map((tab) => (
        <button
          aria-current={props.active === tab.id ? "page" : undefined}
          className={`polis-tab ${props.active === tab.id ? "polis-tab-active" : ""}`}
          key={tab.id}
          onClick={() => props.onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
