import { db } from "@/db";
import { salonSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export async function SiteFooter() {
  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));

  return (
    <footer id="contact" className="border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <p className="font-display text-lg text-ink">{settings?.name ?? "Hairtopia Studio"}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            A premium hair and beauty studio. Booked online, delivered in person.
          </p>
          <p className="mt-4 text-xs uppercase tracking-wide2 text-ink-soft/70">Built by Coratech AI</p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide2 text-ink-soft">Visit</p>
          <p className="mt-3 text-sm text-ink-soft">{settings?.address}</p>
          {settings?.mapUrl && (
            <a href={settings.mapUrl} target="_blank" className="mt-1 inline-block text-sm text-bronze-500 hover:underline">
              View on Google Maps
            </a>
          )}
          <p className="mt-3 text-sm text-ink-soft">
            {settings?.openTime} – {settings?.closeTime}, daily
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide2 text-ink-soft">Contact</p>
          {settings?.email && <p className="mt-3 text-sm text-ink-soft">{settings.email}</p>}
          {settings?.phone && <p className="mt-1 text-sm text-ink-soft">{settings.phone}</p>}
          <div className="mt-3 flex gap-4 text-sm text-bronze-500">
            {settings?.instagram && <span>{settings.instagram}</span>}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide2 text-ink-soft">Quick links</p>
          <div className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
            <Link href="/book" className="hover:text-ink">Book an appointment</Link>
            <Link href="/walkin" className="hover:text-ink">Walk-in / QR check-in</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-ink-soft/70">
        &copy; {new Date().getFullYear()} {settings?.name ?? "Hairtopia Studio"}. All rights reserved.
      </div>
    </footer>
  );
}
