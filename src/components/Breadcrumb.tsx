"use client";

import Link from "next/link";

type Item = { label: string; href?: string };

export default function Breadcrumb({ items }: { items: Item[] }) {
  return (
    <nav aria-label="breadcrumb" className="breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="sep"> / </span>}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
