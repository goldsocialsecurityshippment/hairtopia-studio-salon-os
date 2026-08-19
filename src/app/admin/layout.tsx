import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

const NAV = [
  { href: "/admin", label: "Overview", roles: ["manager", "owner"] },
  { href: "/admin/queue", label: "Queue", roles: ["manager", "owner"] },
  { href: "/admin/appointments", label: "Appointments", roles: ["manager", "owner"] },
  { href: "/admin/staff", label: "Staff", roles: ["manager", "owner"] },
  { href: "/admin/services", label: "Services & pricing", roles: ["owner"] },
  { href: "/admin/gallery", label: "Gallery", roles: ["manager", "owner"] },
  { href: "/admin/reports", label: "Reports", roles: ["manager", "owner"] },
  { href: "/admin/rules", label: "Staff rules", roles: ["owner"] },
  { href: "/admin/settings", label: "Settings", roles: ["owner"] },
  { href: "/admin/audit-log", label: "Audit log", roles: ["owner"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "manager" && user.role !== "owner")) redirect("/login?next=/admin");

  const visibleNav = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-canvas md:flex">
      <aside className="border-b border-line bg-surface md:w-60 md:flex-shrink-0 md:border-b-0 md:border-r">
        <div className="flex h-14 items-center justify-between px-5 md:h-16">
          <Link href="/admin" className="font-display text-base text-ink">
            Hairtopia
          </Link>
          <span className="rounded-full bg-bronze-100 px-2 py-0.5 text-xs font-medium text-bronze-600 md:hidden">
            {user.role === "owner" ? "Owner" : "Manager"}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-6">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-sm px-3 py-2 text-sm text-ink-soft hover:bg-bronze-50 hover:text-ink md:whitespace-normal"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden px-5 pb-6 md:block">
          <p className="text-xs text-ink-soft">{user.name}</p>
          <p className="text-xs uppercase tracking-wide2 text-bronze-500">{user.role}</p>
          <form action={logout} className="mt-3">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
