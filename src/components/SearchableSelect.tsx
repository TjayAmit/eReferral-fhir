"use client";

import { useState, useRef, useEffect, useMemo } from "react";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  disabled = false,
  emptyText = "No matches",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label || "",
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Sync input display when value changes from outside
  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  function handleFocus() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
    setQuery(options.find((o) => o.value === optionValue)?.label || "");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery(selectedLabel);
    }
    if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      handleSelect(filtered[0].value);
    }
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div ref={containerRef} className="searchable-select">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="searchable-select-input"
      />
      {open && !disabled && (
        <div className="searchable-select-dropdown">
          {filtered.length === 0 ? (
            <div className="searchable-select-empty">{emptyText}</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`searchable-select-option${o.value === value ? " sel" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(o.value)}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
