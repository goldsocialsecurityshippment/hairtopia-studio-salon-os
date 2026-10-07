"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setStaffActive } from "@/lib/actions/staff";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Staff = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  bio: string | null;
  specialties: string | null;
  yearsExperience: number | null;
};

export function StaffCard({
  staff,
  attendanceStatus,
  avgRating,
  reviewCount,
  canManage,
}: {
  staff: Staff;
  attendanceStatus: string;
  avgRating: number | null;
  reviewCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function toggleActive() {
    setPending(true);
    await setStaffActive(staff.id, !staff.active);
    setPending(false);
    setConfirming(false);
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-base text-ink">{staff.name}</p>
          <p className="text-xs uppercase tracking-wide2 text-bronze-500">{staff.role}</p>
        </div>
        <div className="flex gap-2">
          <Badge tone={staff.active ? "success" : "danger"}>{staff.active ? "Active" : "Deactivated"}</Badge>
          {staff.role === "stylist" && <Badge tone={statusTone(attendanceStatus)}>{statusLabel(attendanceStatus)}</Badge>}
        </div>
      </div>

      {staff.specialties && <p className="mt-2 text-sm text-ink-soft">{staff.specialties}</p>}
      {staff.bio && <p className="mt-1 text-sm text-ink-soft">{staff.bio}</p>}

      <div className="mt-3 flex gap-4 text-xs text-ink-soft">
        {avgRating != null && <span>★ {avgRating.toFixed(1)} ({reviewCount} reviews)</span>}
        {staff.yearsExperience != null && <span>{staff.yearsExperience} yrs experience</span>}
      </div>

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/admin/staff/${staff.id}`}>
            <Button size="sm" variant="secondary">HR record</Button>
          </Link>
          {!confirming ? (
            <Button size="sm" variant={staff.active ? "secondary" : "primary"} onClick={() => setConfirming(true)}>
              {staff.active ? "Deactivate" : "Reactivate"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-ink-soft">Are you sure?</p>
              <Button size="sm" variant="danger" onClick={toggleActive} loading={pending}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
