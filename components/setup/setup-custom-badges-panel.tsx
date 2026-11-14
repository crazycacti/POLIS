"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { SetupOverlayField } from "@/components/setup/setup-overlay-controls";
import { CUSTOM_BADGE_ICON_NAMES, type CustomBadgeIcon } from "@/lib/custom-badge-icons";
import {
  CUSTOM_BADGE_CORNERS,
  CUSTOM_BADGE_DEFAULTS,
  MAX_CUSTOM_BADGE_TEXT,
  MAX_CUSTOM_BADGES,
  type CustomBadge,
  type CustomBadgeCorner,
  type CustomBadgeShowOn,
} from "@/lib/custom-badges";

const CORNER_LABEL: Record<CustomBadgeCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

const SHOW_ON_OPTIONS: { value: CustomBadgeShowOn; label: string }[] = [
  { value: "all", label: "All titles" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
];

const MIN_RATING_OPTIONS = [6, 7, 8, 9];
const NEW_BADGE_ICON: CustomBadgeIcon = "star";

function iconLabel(icon: string): string {
  return icon.charAt(0).toUpperCase() + icon.slice(1);
}

function nextCorner(badges: CustomBadge[]): CustomBadgeCorner {
  const used = new Set(badges.map((badge) => badge.corner));
  return CUSTOM_BADGE_CORNERS.find((corner) => !used.has(corner)) ?? CUSTOM_BADGE_DEFAULTS.corner;
}

export function SetupCustomBadgesPanel(props: {
  badges: CustomBadge[];
  onChange: Dispatch<SetStateAction<CustomBadge[]>>;
}) {
  const { badges, onChange } = props;
  const update = (index: number, patch: Partial<CustomBadge>) =>
    onChange((list) => list.map((badge, i) => (i === index ? { ...badge, ...patch } : badge)));
  const remove = (index: number) => onChange((list) => list.filter((_, i) => i !== index));
  const add = () =>
    onChange((list) =>
      list.length >= MAX_CUSTOM_BADGES
        ? list
        : [...list, { ...CUSTOM_BADGE_DEFAULTS, icon: NEW_BADGE_ICON, corner: nextCorner(list) }],
    );

  return (
    <section aria-labelledby="custom-badges-heading" className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white" id="custom-badges-heading">
          Your badges
          <span className="ml-2 text-sm font-normal tabular-nums text-zinc-400">
            {badges.length}
            <span className="sr-only"> of {MAX_CUSTOM_BADGES}</span>
          </span>
        </h2>
        {badges.length > 0 ? (
          <button
            className="polis-btn-secondary"
            disabled={badges.length >= MAX_CUSTOM_BADGES}
            onClick={add}
            type="button"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add badge
          </button>
        ) : null}
      </div>

      {badges.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
          <p className="text-sm text-zinc-400">No badges yet.</p>
          <button className="polis-btn-secondary" onClick={add} type="button">
            <Plus aria-hidden className="h-4 w-4" />
            Add badge
          </button>
        </div>
      ) : (
        <ol className="border-t border-white/5">
          {badges.map((badge, index) => (
            <li className="grid gap-4 border-b border-white/5 py-5 sm:grid-cols-2" key={index}>
              <SetupOverlayField label="Text">
                <input
                  className="polis-input w-full"
                  maxLength={MAX_CUSTOM_BADGE_TEXT}
                  onChange={(e) => update(index, { text: e.target.value })}
                  placeholder="Optional"
                  type="text"
                  value={badge.text}
                />
              </SetupOverlayField>
              <SetupOverlayField label="Icon">
                <select
                  className="polis-select w-full"
                  onChange={(e) =>
                    update(index, { icon: e.target.value ? (e.target.value as CustomBadgeIcon) : null })
                  }
                  value={badge.icon ?? ""}
                >
                  <option value="">None</option>
                  {CUSTOM_BADGE_ICON_NAMES.map((icon) => (
                    <option key={icon} value={icon}>
                      {iconLabel(icon)}
                    </option>
                  ))}
                </select>
              </SetupOverlayField>
              <SetupOverlayField label="Corner">
                <select
                  className="polis-select w-full"
                  onChange={(e) => update(index, { corner: e.target.value as CustomBadgeCorner })}
                  value={badge.corner}
                >
                  {CUSTOM_BADGE_CORNERS.map((corner) => (
                    <option key={corner} value={corner}>
                      {CORNER_LABEL[corner]}
                    </option>
                  ))}
                </select>
              </SetupOverlayField>
              <div className="grid grid-cols-2 gap-4">
                <SetupOverlayField label="Text color">
                  <input
                    className="h-10 w-full cursor-pointer rounded-md border border-white/15 bg-transparent"
                    onChange={(e) => update(index, { color: e.target.value })}
                    type="color"
                    value={badge.color}
                  />
                </SetupOverlayField>
                <SetupOverlayField label="Background">
                  <input
                    className="h-10 w-full cursor-pointer rounded-md border border-white/15 bg-transparent"
                    onChange={(e) => update(index, { background: e.target.value })}
                    type="color"
                    value={badge.background}
                  />
                </SetupOverlayField>
              </div>
              <SetupOverlayField label="Show on">
                <select
                  className="polis-select w-full"
                  onChange={(e) => update(index, { showOn: e.target.value as CustomBadgeShowOn })}
                  value={badge.showOn}
                >
                  {SHOW_ON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </SetupOverlayField>
              <div className="flex items-end gap-3">
                <SetupOverlayField className="flex-1" label="Minimum rating">
                  <select
                    className="polis-select w-full"
                    onChange={(e) => update(index, { minRating: e.target.value ? Number(e.target.value) : null })}
                    value={badge.minRating ?? ""}
                  >
                    <option value="">Any</option>
                    {MIN_RATING_OPTIONS.map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}+
                      </option>
                    ))}
                  </select>
                </SetupOverlayField>
                <button
                  aria-label={`Remove badge ${index + 1}`}
                  className="polis-btn-secondary shrink-0"
                  onClick={() => remove(index)}
                  type="button"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
