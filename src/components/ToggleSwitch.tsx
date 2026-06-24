"use client";

import React from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

export default function ToggleSwitch({ checked, onChange, label, id }: ToggleSwitchProps) {
  const toggleId = id || React.useId();

  return (
    <div className="toggle-switch-wrapper">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={toggleId}
        className={`toggle-switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
      {label && (
        <label htmlFor={toggleId} className="toggle-label">
          {label}
        </label>
      )}
    </div>
  );
}
