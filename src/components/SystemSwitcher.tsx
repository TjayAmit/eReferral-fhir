"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

export type System = "doh-lgu" | "clinical" | "ereferral";

export const SYSTEMS: { id: System; label: string; short: string; icon: React.ReactNode }[] = [
  {
    id: "doh-lgu",
    label: "DOH & LGU",
    short: "DOH/LGU",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M5 21V7l8-4 8 4v14M8 21v-9h8v9" />
      </svg>
    ),
  },
  {
    id: "clinical",
    label: "Clinical Workflow",
    short: "Clinical",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.49 4.04 3 5.5l7 7Z" />
      </svg>
    ),
  },
  {
    id: "ereferral",
    label: "eReferral",
    short: "eReferral",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  },
];

export default function SystemSwitcher({
  active,
  onChange,
}: {
  active: System;
  onChange: (system: System) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const justOpenedRef = useRef(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;

    // Prevent the same frame click (e.g. toggle double-click) from immediately closing
    justOpenedRef.current = true;
    const rafId = requestAnimationFrame(() => {
      justOpenedRef.current = false;
    });

    const onClick = (e: MouseEvent) => {
      if (justOpenedRef.current) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const activeSystem = SYSTEMS.find((s) => s.id === active) ?? SYSTEMS[2];

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (system: System) => {
      setOpen(false);
      onChange(system);
    },
    [onChange]
  );

  return (
    <>
      {open && (
        <div
          className="system-switcher-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="system-switcher" ref={containerRef}>
        {open && (
          <div className="system-switcher-menu" onClick={(e) => e.stopPropagation()}>
            {SYSTEMS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={active === s.id ? "active" : ""}
                onClick={() => handleSelect(s.id)}
                aria-pressed={active === s.id}
              >
                <span className="ic" aria-hidden>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="system-switcher-toggle"
          onClick={handleToggle}
          aria-expanded={open}
          aria-label="Switch system"
        >
          <span className="ic" aria-hidden>{activeSystem.icon}</span>
          <span>{activeSystem.short}</span>
        </button>
      </div>
    </>
  );
}
