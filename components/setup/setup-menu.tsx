"use client";

import type { LucideIcon } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type SetupMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  dividerBefore?: boolean;
};

export function SetupMenu(props: {
  label: string;
  icon: LucideIcon;
  items: SetupMenuItem[];
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const Icon = props.icon;
  const count = props.items.length;

  useEffect(() => {
    if (!open) return;
    itemRefs.current[focusIndex]?.focus();
  }, [focusIndex, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openAt(index: number) {
    setFocusIndex(index);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(count - 1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusIndex((index) => (index + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusIndex((index) => (index - 1 + count) % count);
    } else if (event.key === "Home") {
      event.preventDefault();
      setFocusIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setFocusIndex(count - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={props.iconOnly ? props.label : undefined}
        className={props.iconOnly ? "polis-icon-btn pointer-coarse:h-11 pointer-coarse:w-11" : "polis-btn-secondary"}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKeyDown}
        ref={buttonRef}
        type="button"
      >
        <Icon aria-hidden className="h-4 w-4" />
        {props.iconOnly ? null : props.label}
      </button>
      {open ? (
        <div
          aria-label={props.label}
          className="absolute right-0 top-full z-30 mt-2 min-w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-xl"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          role="menu"
        >
          {props.items.map((item, index) => (
            <Fragment key={item.label}>
              {item.dividerBefore ? <div className="my-1 h-px bg-white/10" role="separator" /> : null}
              <button
                aria-disabled={item.disabled || undefined}
                className={`flex min-h-11 w-full items-center px-4 text-left text-sm focus-visible:bg-white/10 focus-visible:outline-none ${
                  item.disabled ? "cursor-not-allowed text-zinc-500" : "text-zinc-200 hover:bg-white/5 hover:text-white"
                }`}
                onClick={() => {
                  if (item.disabled) return;
                  close(true);
                  item.onSelect();
                }}
                onFocus={() => setFocusIndex(index)}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                role="menuitem"
                tabIndex={index === focusIndex ? 0 : -1}
                type="button"
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
