"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Member = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  bio: string | null;
  specialties: string | null;
  photoUrl: string | null;
  avgRating: number | null;
  reviewCount: number;
  ratingBreakdown: Record<string, number | null> | null;
  reviews: { id: string; overallRating: number; comment: string | null }[];
};

export function TeamGrid({
  members,
  categoryLabels,
}: {
  members: Member[];
  categoryLabels: Record<string, string>;
}) {
  const [filter, setFilter] = useState<string>("all");

  const categories = useMemo(() => {
    const present = new Set(members.map((m) => m.category));
    return ["all", ...Object.keys(categoryLabels).filter((c) => present.has(c))];
  }, [members, categoryLabels]);

  const visible = filter === "all" ? members : members.filter((m) => m.category === filter);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === c ? "border-ink bg-ink text-canvas" : "border-line text-ink-soft hover:border-ink/40"
            }`}
          >
            {c === "all" ? "All" : categoryLabels[c] ?? c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-ink-soft">No professionals in this category yet.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <Card key={m.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-bronze-50">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photoUrl} alt={m.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-lg text-bronze-500">
                      {m.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-display text-base text-ink">{m.name}</p>
                  <p className="text-xs uppercase tracking-wide text-bronze-500">{m.categoryLabel}</p>
                  {m.avgRating != null ? (
                    <p className="mt-0.5 text-xs text-ink-soft">
                      ★ {m.avgRating.toFixed(1)} · {m.reviewCount} review{m.reviewCount === 1 ? "" : "s"}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-ink-soft">No reviews yet</p>
                  )}
                </div>
              </div>

              {m.bio && <p className="mt-3 text-sm text-ink-soft">{m.bio}</p>}
              {m.specialties && (
                <p className="mt-2 text-xs text-ink-soft">
                  <span className="font-medium text-ink">Specialties: </span>
                  {m.specialties}
                </p>
              )}

              {m.reviews.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {m.reviews.slice(0, 2).map((r) => (
                    <p key={r.id} className="text-xs italic text-ink-soft">
                      “{r.comment ?? "Great service!"}” — ★{r.overallRating}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-auto pt-4">
                <Link href={`/book?stylist=${m.id}`}>
                  <Button size="sm" className="w-full">
                    Book with {m.name.split(" ")[0]}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
