"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitReview, updateReview } from "@/lib/actions/reviews";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

const CATEGORIES = [
  { key: "qualityRating", label: "Service quality" },
  { key: "professionalismRating", label: "Professionalism" },
  { key: "communicationRating", label: "Communication" },
  { key: "respectfulnessRating", label: "Respectfulness" },
  { key: "punctualityRating", label: "Punctuality" },
] as const;

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className={`text-xl ${n <= value ? "text-bronze-400" : "text-ink/15"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

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

export function ReviewForm({
  appointmentId,
  existingReview,
  onDone,
}: {
  appointmentId: string;
  existingReview?: ExistingReview;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [overall, setOverall] = useState(existingReview?.overallRating ?? 0);
  const [ratings, setRatings] = useState<Record<string, number>>({
    qualityRating: existingReview?.qualityRating ?? 0,
    professionalismRating: existingReview?.professionalismRating ?? 0,
    communicationRating: existingReview?.communicationRating ?? 0,
    respectfulnessRating: existingReview?.respectfulnessRating ?? 0,
    punctualityRating: existingReview?.punctualityRating ?? 0,
  });
  const [comment, setComment] = useState(existingReview?.comment ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (overall === 0) {
      setError("Please choose an overall rating.");
      return;
    }
    setPending(true);
    setError(null);

    const payload = {
      overallRating: overall,
      qualityRating: ratings.qualityRating || undefined,
      professionalismRating: ratings.professionalismRating || undefined,
      communicationRating: ratings.communicationRating || undefined,
      respectfulnessRating: ratings.respectfulnessRating || undefined,
      punctualityRating: ratings.punctualityRating || undefined,
      comment: comment || undefined,
    };

    const result = existingReview
      ? await updateReview({ reviewId: existingReview.id, ...payload })
      : await submitReview({ appointmentId, ...payload });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
    router.refresh();
    onDone?.();
  }

  if (submitted && !existingReview) {
    return <p className="text-sm text-moss">Thank you for your review.</p>;
  }

  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-5">
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Overall rating</p>
        <Stars value={overall} onChange={setOverall} />
      </div>
      {CATEGORIES.map((c) => (
        <div key={c.key}>
          <p className="mb-1.5 text-sm text-ink-soft">{c.label}</p>
          <Stars value={ratings[c.key] ?? 0} onChange={(v) => setRatings((r) => ({ ...r, [c.key]: v }))} />
        </div>
      ))}
      <Textarea label="Comments (optional)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-sm text-rust">{error}</p>}
      <Button onClick={handleSubmit} loading={pending}>
        {existingReview ? "Save changes" : "Submit review"}
      </Button>
    </div>
  );
}
