"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/stylist", label: "Today" },
  { href: "/stylist/attendance", label: "Attendance" },
  { href: "/stylist/ratings", label: "Ratings" },
  { href: "/stylist/rules", label: "Rules" },
];

export function StylistNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-3 text-xs font-medium ${
                active ? "text-ink" : "text-ink-soft"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-bronze-400" : "bg-transparent"}`} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
