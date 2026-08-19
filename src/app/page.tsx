import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getCategoriesWithServices, getActiveStylists, getPublishedReviews, getSettings, getGalleryImages } from "@/lib/data/queries";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";


export default async function HomePage() {
  const [categories, stylists, reviews, settings, galleryImages] = await Promise.all([
    getCategoriesWithServices(),
    getActiveStylists(),
    getPublishedReviews(),
    getSettings(),
    getGalleryImages(),
  ]);

  const featuredCategories = categories.slice(0, 6);

  return (
    <>
      <SiteHeader />
      <main>
        {/* HERO — desktop: peach split, badge bottom-right of the photo */}
        <section className="relative hidden border-b border-line md:block" style={{ backgroundColor: "#EABD9D" }}>
          <div className="grid md:grid-cols-2 md:items-center">
            <div className="px-8 py-24 md:pl-10 lg:pl-16">
              <div className="max-w-md">
                <p className="text-xs font-medium uppercase tracking-wide2 text-ink/60">
                  {settings?.address}
                </p>
                <h1 className="mt-4 font-display text-4xl leading-[1.1] text-ink lg:text-5xl">
                  Hair, done with intention.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-ink/70">
                  Book your stylist, share your reference style, and arrive to a service built
                  around clear communication — every step recorded, every appointment accounted for.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    href="/book"
                    className="rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-canvas hover:bg-ink/85"
                  >
                    Book an appointment
                  </Link>
                  <Link
                    href="/walkin"
                    className="rounded-sm border border-ink/25 px-6 py-3.5 text-sm font-medium text-ink hover:border-ink/50"
                  >
                    I&apos;m a walk-in
                  </Link>
                </div>
                <p className="mt-6 text-xs text-ink/60">
                  Open {settings?.openTime} – {settings?.closeTime} · {settings?.address}
                </p>
              </div>
            </div>

            <div className="relative h-[560px] lg:h-[640px]">
              <Image
                src="/brand/hero-group.jpg"
                alt="Hairtopia Studio styling"
                fill
                className="object-cover object-right"
                priority
              />
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-24"
                style={{ background: "linear-gradient(to right, #EABD9D, transparent)" }}
              />
              <div className="absolute right-8 top-8 h-44 w-44 overflow-hidden rounded-full border-4 border-white bg-white shadow-soft lg:h-52 lg:w-52">
                <Image
                  src="/brand/hairtopia-logo.jpg"
                  alt="Hairtopia Studio"
                  width={208}
                  height={208}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* HERO — mobile: single full-bleed photo, text overlaid directly on it */}
        <section className="relative block border-b border-line md:hidden">
          <div className="relative h-[640px] w-full">
            <Image
              src="/brand/hero-group.jpg"
              alt="Hairtopia Studio styling"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-transparent" />

            <div className="absolute right-4 top-4 h-16 w-16 overflow-hidden rounded-full border-2 border-white bg-white shadow-soft">
              <Image
                src="/brand/hairtopia-logo.jpg"
                alt="Hairtopia Studio"
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="absolute inset-x-0 bottom-0 px-5 pb-10">
              <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-300">
                {settings?.address}
              </p>
              <h1 className="mt-3 font-display text-3xl leading-[1.15] text-white">
                Hair, done with intention.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/80">
                Book your stylist, share your reference style, and arrive to a service built
                around clear communication.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/book"
                  className="rounded-sm bg-bronze-400 px-5 py-3 text-sm font-medium text-ink hover:bg-bronze-300"
                >
                  Book an appointment
                </Link>
                <Link
                  href="/walkin"
                  className="rounded-sm border border-white/40 px-5 py-3 text-sm font-medium text-white hover:bg-white/10"
                >
                  I&apos;m a walk-in
                </Link>
              </div>
              <p className="mt-4 text-xs text-white/70">
                Open {settings?.openTime} – {settings?.closeTime}
              </p>
            </div>
          </div>
        </section>
        {/* WHY CHOOSE US */}
        <section className="container-page py-16">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Your request, on record",
                body: "Upload a reference photo and instructions. Your stylist reviews it before you sit down.",
              },
              {
                title: "Clear appointment timeline",
                body: "From booking to check-in to completed work — every step is logged so nothing gets lost.",
              },
              {
                title: "Rated by real clients",
                body: "Choose your stylist by specialty, experience and verified reviews.",
              },
            ].map((item) => (
              <div key={item.title} className="border-t border-ink/10 pt-5">
                <h3 className="font-display text-lg text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="border-y border-line bg-surface py-16">
          <div className="container-page">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Services</p>
                <h2 className="mt-2 font-display text-3xl text-ink">What we offer</h2>
              </div>
              <Link href="/book" className="hidden text-sm text-bronze-500 hover:underline md:block">
                View full price list →
              </Link>
            </div>
            <p className="mt-3 max-w-xl text-sm text-ink-soft">
              Prices are service estimates and may change based on style, hair length and preference.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredCategories.map((cat) => (
                <div key={cat.id} className="rounded-card border border-line bg-canvas p-6">
                  <h3 className="font-display text-lg text-ink">{cat.name}</h3>
                  <ul className="mt-3 space-y-2">
                    {cat.services.slice(0, 4).map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink-soft">{s.name}</span>
                        <span className="whitespace-nowrap text-ink">
                          GH₵{s.priceMin}
                          {s.priceMax ? `–${s.priceMax}` : "+"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/book"
                    className="mt-5 inline-block text-sm font-medium text-bronze-500 hover:underline"
                  >
                    Book this category →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STYLISTS */}
        <section id="stylists" className="container-page py-16">
          <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Our team</p>
          <h2 className="mt-2 font-display text-3xl text-ink">Choose your stylist</h2>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stylists.length === 0 && (
              <p className="text-sm text-ink-soft">Stylist profiles will appear here once added by the salon.</p>
            )}
            {stylists.map((s) => (
              <div key={s.id} className="rounded-card border border-line bg-surface p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bronze-100 font-display text-xl text-bronze-600">
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-display text-base text-ink">{s.name}</p>
                    {s.avgRating ? (
                      <p className="text-xs text-ink-soft">
                        ★ {s.avgRating.toFixed(1)} · {s.reviewCount} review{s.reviewCount === 1 ? "" : "s"}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-soft">New stylist</p>
                    )}
                  </div>
                </div>
                {s.profile?.specialties && (
                  <p className="mt-3 text-sm text-ink-soft">{s.profile.specialties}</p>
                )}
                {s.profile?.bio && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.profile.bio}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* GALLERY */}
        <section id="gallery" className="border-y border-line bg-surface py-16">
          <div className="container-page">
            <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Gallery</p>
            <h2 className="mt-2 font-display text-3xl text-ink">Recent work</h2>
            {galleryImages.length === 0 ? (
              <>
                <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {["Braids", "Retouch", "Styling", "Nails"].map((label) => (
                    <div
                      key={label}
                      className="flex aspect-square items-center justify-center rounded-card bg-gradient-to-br from-bronze-100 to-bronze-300"
                    >
                      <span className="font-display text-sm tracking-wide text-bronze-700">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-ink-soft">
                  The owner can upload real work photos from Admin → Gallery.
                </p>
              </>
            ) : (
              <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                {galleryImages.slice(0, 8).map((img) => (
                  <div key={img.id} className="group relative aspect-square overflow-hidden rounded-card">
                    {img.mediaType === "video" ? (
                      <video src={img.mediaUrl} className="h-full w-full object-cover" />
                    ) : (
                      <Image
                        src={img.mediaUrl}
                        alt={img.caption ?? img.category}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    )}
                    <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2.5 py-1 text-xs text-white">
                      {img.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* TESTIMONIALS */}
        {reviews.length > 0 && (
          <section className="container-page py-16">
            <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Client reviews</p>
            <h2 className="mt-2 font-display text-3xl text-ink">What clients say</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {reviews.map(({ review, appointment }) => (
                <div key={review.id} className="rounded-card border border-line bg-surface p-6">
                  <Badge tone="info">★ {review.overallRating}/5</Badge>
                  {review.comment && <p className="mt-3 text-sm leading-relaxed text-ink-soft">&ldquo;{review.comment}&rdquo;</p>}
                  <p className="mt-4 text-xs text-ink-soft">— {appointment.customerName}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="bg-ink py-16">
          <div className="container-page flex flex-col items-center gap-5 text-center">
            <h2 className="font-display text-3xl text-canvas">Ready to book?</h2>
            <p className="max-w-md text-sm text-canvas/70">
              Choose your service, your stylist and a time that works for you.
            </p>
            <Link
              href="/book"
              className="rounded-sm bg-bronze-400 px-6 py-3.5 text-sm font-medium text-ink hover:bg-bronze-300"
            >
              Book an appointment
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
