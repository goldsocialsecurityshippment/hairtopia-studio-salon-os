import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/actions/auth";

const navLinks = [
  { href: "/#services", label: "Services" },
  { href: "/#stylists", label: "Stylists" },
  { href: "/#gallery", label: "Gallery" },
  { href: "/#contact", label: "Contact" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

  const accountHref =
    user?.role === "stylist" ? "/stylist" : user?.role === "manager" || user?.role === "owner" ? "/admin" : "/account";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/brand/hairtopia-logo.jpg"
            alt="Hairtopia Studio"
            width={34}
            height={34}
            className="shrink-0 rounded-full"
          />
          <span className="hidden font-display text-lg tracking-wide text-ink sm:inline">Hairtopia Studio</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-ink-soft transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user ? (
            <Link
              href={accountHref}
              className="whitespace-nowrap rounded-sm border border-ink/15 px-3 py-2 text-sm font-medium text-ink hover:border-ink/40 sm:px-4"
            >
              {user.role === "customer" ? "My Account" : "Dashboard"}
            </Link>
          ) : (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-sm border border-ink/15 px-3 py-2 text-sm font-medium text-ink hover:border-ink/40 sm:px-4"
            >
              Sign in
            </Link>
          )}
          <Link
            href="/book"
            className="whitespace-nowrap rounded-sm bg-ink px-3 py-2 text-sm font-medium text-canvas hover:bg-bronze-600 sm:px-4"
          >
            Book now
          </Link>
        </div>
      </div>
    </header>
  );
}
