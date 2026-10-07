import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/actions/auth";
import { StylistNav } from "@/components/stylist/StylistNav";
import { Button } from "@/components/ui/Button";
import { PushToggle } from "@/components/PushToggle";
import { NotificationPreferences } from "@/components/NotificationPreferences";

export default async function StylistLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "stylist") redirect("/login?next=/stylist");

  return (
    <div className="min-h-screen bg-canvas pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/stylist" className="font-display text-base text-ink">
            Hairtopia
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-soft">{user.name.split(" ")[0]}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <nav className="hidden gap-6 border-t border-line px-4 py-2 text-sm md:flex">
          <Link href="/stylist" className="text-ink-soft hover:text-ink">Today</Link>
          <Link href="/stylist/attendance" className="text-ink-soft hover:text-ink">Attendance</Link>
          <Link href="/stylist/ratings" className="text-ink-soft hover:text-ink">Ratings</Link>
          <Link href="/stylist/rules" className="text-ink-soft hover:text-ink">Rules</Link>
        </nav>
        <div className="border-t border-line px-4 py-2 md:hidden">
          <PushToggle />
          <NotificationPreferences
            userId={user.id}
            relevantKeys={["bookingEvents", "cancellationEvents", "consultationEvents", "queueEvents", "staffEvents"]}
          />
        </div>
      </header>
      <main className="px-4 py-5">{children}</main>
      <StylistNav />
    </div>
  );
}
