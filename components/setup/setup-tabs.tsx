"use client";

export type SetupTab = "style" | "keys" | "catalogs" | "export";

const TABS: { id: SetupTab; label: string }[] = [
  { id: "style", label: "Overlays" },
  { id: "keys", label: "API keys" },
  { id: "catalogs", label: "Catalogs" },
  { id: "export", label: "Install" },
];

export function SetupTabs(props: {
  active: SetupTab;
  onChange: (tab: SetupTab) => void;
  installLocked?: boolean;
  installLockTooltip?: string;
}) {
  return (
    <nav
      aria-label="Setup sections"
      className="mb-6 flex flex-wrap gap-2 border-b border-white/5 pb-4"
    >
      {TABS.map((tab) => {
        const locked = tab.id === "export" && props.installLocked;
        const tooltip = locked ? props.installLockTooltip : undefined;

        const button = (
          <button
            aria-disabled={locked}
            className={`polis-tab ${props.active === tab.id ? "polis-tab-active" : ""} ${locked ? "polis-tab-locked" : ""}`}
            disabled={locked}
            onClick={() => {
              if (!locked) props.onChange(tab.id);
            }}
            type="button"
          >
            {tab.label}
          </button>
        );

        if (!locked || !tooltip) {
          return <span key={tab.id}>{button}</span>;
        }

        return (
          <span className="polis-tab-tooltip-wrap" key={tab.id}>
            {button}
            <span className="polis-tab-tooltip" role="tooltip">
              {tooltip}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
