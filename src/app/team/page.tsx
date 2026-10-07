import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getPublicTeam, getPublicReviewsForStylist } from "@/lib/data/queries";
import { TeamGrid } from "./TeamGrid";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  hair_stylist: "Hair Stylist",
  nail_technician: "Nail Technician",
  lash_technician: "Lash Technician",
  makeup_artist: "Makeup Artist",
  other: "Other Beauty Professional",
};

export default async function TeamPage() {
  const team = await getPublicTeam();

  const withReviews = await Promise.all(
    team.map(async (member) => ({
      id: member.id,
      name: member.name,
      category: member.profile?.category ?? "hair_stylist",
      categoryLabel: CATEGORY_LABELS[member.profile?.category ?? "hair_stylist"],
      bio: member.profile?.bio ?? null,
      specialties: member.profile?.specialties ?? null,
      photoUrl: member.profile?.photoUrl ?? null,
      avgRating: member.avgRating,
      reviewCount: member.reviewCount,
      ratingBreakdown: member.ratingBreakdown,
      reviews: (await getPublicReviewsForStylist(member.id, 3)).map((r) => ({
        id: r.review.id,
        overallRating: r.review.overallRating,
        comment: r.review.comment,
      })),
    }))
  );

  return (
    <>
      <SiteHeader />
      <main className="container-page py-12 md:py-16">
        <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Meet Our Team</p>
        <h1 className="mt-2 font-display text-3xl text-ink">The professionals behind Hairtopia Studio</h1>
        <p className="mt-2 max-w-lg text-sm text-ink-soft">
          Every rating below is calculated from real, approved client reviews — never typed in by hand.
        </p>

        <div className="mt-10">
          <TeamGrid members={withReviews} categoryLabels={CATEGORY_LABELS} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
