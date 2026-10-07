"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { updateStaffCategory, updateStylistServices } from "@/lib/actions/staff";

const CATEGORY_OPTIONS = [
  { value: "hair_stylist", label: "Hair Stylist" },
  { value: "nail_technician", label: "Nail Technician" },
  { value: "lash_technician", label: "Lash Technician" },
  { value: "makeup_artist", label: "Makeup Artist" },
  { value: "other", label: "Other Beauty Professional" },
] as const;

type Category = { id: string; name: string; services: { id: string; name: string }[] };

/**
 * This is the fix for the audit finding "updateStylistServices exists but
 * has zero UI callers." A checked service here is exactly what makes this
 * professional show up as eligible in the booking wizard's stylist step
 * (see `eligibleStylists` filter in BookingWizard.tsx, which reads the
 * same `stylist_services` rows this panel writes) — this isn't cosmetic,
 * it directly gates who a customer can book for Bridal Makeup, Soft Glam,
 * or any other service.
 */
export function ProfessionalProfilePanel({
  staffId,
  currentCategory,
  categories,
  assignedServiceIds,
}: {
  staffId: string;
  currentCategory: string;
  categories: Category[];
  assignedServiceIds: string[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState(currentCategory);
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedServiceIds));
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveCategory(next: string) {
    setCategory(next);
    setSavingCategory(true);
    await updateStaffCategory(staffId, next as typeof CATEGORY_OPTIONS[number]["value"]);
    setSavingCategory(false);
    router.refresh();
  }

  function toggle(serviceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
    setSaved(false);
  }

  async function saveServices() {
    setSavingServices(true);
    setError(null);
    const result = await updateStylistServices(staffId, Array.from(selected));
    setSavingServices(false);
    if (!result.ok) return setError("Could not save — please try again.");
    setSaved(true);
    router.refresh();
  }

  return (
    <Card className="p-5">
      <p className="font-display text-lg text-ink">Professional profile</p>
      <p className="mt-1 text-xs text-ink-soft">
        Category controls how this person appears on the public Team page. Assigned services control
        which appointments they&apos;re eligible to be booked for.
      </p>

      <div className="mt-4 max-w-xs">
        <Select
          label="Category"
          value={category}
          onChange={(e) => saveCategory(e.target.value)}
          disabled={savingCategory}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-medium text-ink">Assigned services</p>
        <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
          {categories.map((cat) => (
            <div key={cat.id}>
              <p className="text-xs font-medium uppercase tracking-wide text-bronze-500">{cat.name}</p>
              <div className="mt-1.5 space-y-1">
                {cat.services.length === 0 && <p className="text-xs text-ink-soft">No active services in this category.</p>}
                {cat.services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-rust">{error}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" loading={savingServices} onClick={saveServices}>Save assigned services</Button>
          {saved && <span className="text-xs text-ink-soft">Saved — this is now live in the booking wizard.</span>}
        </div>
      </div>
    </Card>
  );
}
