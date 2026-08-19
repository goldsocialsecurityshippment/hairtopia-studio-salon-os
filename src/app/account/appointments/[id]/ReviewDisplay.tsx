"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ReviewForm } from "./ReviewForm";

type ExistingReview = {
  id: string;
  overallRating: number;
  qualityRating: number | null;
  professionalismRating: number | null;
  communicationRating: number | null;
  respectfulnessRating: number | null;
  punctualityRating: number | null;
  comment: string | null;
};

export function ReviewDisplay({ appointmentId, review }: { appointmentId: string; review: ExistingReview }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-ink">Edit your review</p>
        <ReviewForm appointmentId={appointmentId} existingReview={review} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-card border border-line bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">Your review</p>
          <p className="mt-1 text-sm text-ink">★ {review.overallRating}/5</p>
          {review.comment && <p className="mt-1 text-sm text-ink-soft">&ldquo;{review.comment}&rdquo;</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
    </div>
  );
}
