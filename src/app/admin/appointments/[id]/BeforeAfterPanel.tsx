"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewCompletedWork } from "@/lib/actions/service-flow";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Reference = { id: string; url: string; type: string };
type WorkItem = { id: string; photoUrl: string; mediaType: string; reviewStatus: string; uploadedAt: string };

function MediaThumb({ url, type }: { url: string; type: string }) {
  if (type === "video") {
    return <video src={url} controls className="h-40 w-40 rounded-card object-cover" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-40 w-40 rounded-card object-cover" />;
}

export function BeforeAfterPanel({
  references,
  workItems,
}: {
  references: Reference[];
  workItems: WorkItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function review(id: string, status: "approved" | "needs_review" | "issue_reported") {
    setPendingId(id);
    await reviewCompletedWork({ completedWorkId: id, status });
    setPendingId(null);
    router.refresh();
  }

  if (references.length === 0 && workItems.length === 0) {
    return <p className="text-sm text-ink-soft">No reference material or finished-look photos yet.</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide2 text-ink-soft">Customer requested (before)</p>
        {references.length === 0 ? (
          <p className="text-sm text-ink-soft">No reference material was uploaded.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {references.map((r) => (
              <MediaThumb key={r.id} url={r.url} type={r.type} />
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide2 text-ink-soft">Stylist finished look (after)</p>
        {workItems.length === 0 ? (
          <p className="text-sm text-ink-soft">No finished-look photos uploaded yet.</p>
        ) : (
          <div className="space-y-4">
            {workItems.map((w) => (
              <div key={w.id} className="space-y-2">
                <MediaThumb url={w.photoUrl} type={w.mediaType} />
                <Badge tone={statusTone(w.reviewStatus)}>{statusLabel(w.reviewStatus)}</Badge>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => review(w.id, "approved")} loading={pendingId === w.id}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => review(w.id, "needs_review")} loading={pendingId === w.id}>
                    Needs review
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => review(w.id, "issue_reported")} loading={pendingId === w.id}>
                    Report issue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
