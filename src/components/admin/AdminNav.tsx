"use client";

// Per-business navigation with an active state. The current route renders as a
// solid blue pill (matching the reference console); others are quiet gray links.

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<[label: string, href: string]> = [
  ["Overview", "/admin"],
  ["Journeys", "/admin/journeys"],
  ["FAQs", "/admin/faqs"],
  ["Content", "/admin/content"],
  ["Leads", "/admin/leads"],
  ["Analytics", "/admin/analytics"],
  ["Automations", "/admin/automations"],
  ["Domains", "/admin/domains"],
  ["Settings", "/admin/settings"],
];

export function AdminNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="space-y-1">
      {items.map(([label, href]) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`block rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-blue-600 font-medium text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
