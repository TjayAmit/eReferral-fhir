"use client";

import Breadcrumb from "./Breadcrumb";
import { useSettings } from "@/lib/settings-context";

export default function AppNavbar({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  const { server } = useSettings();

  return (
    <div className="app-navbar">
      <Breadcrumb items={items} />
      <div className="app-navbar-meta">
        <span className="app-navbar-label">FHIR Server</span>
        <span className="app-navbar-value" title={server.endpoint}>
          {server.name}
        </span>
      </div>
    </div>
  );
}
