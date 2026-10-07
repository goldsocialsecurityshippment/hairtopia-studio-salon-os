"use client";

import { useEffect, useState } from "react";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/actions/push";

const LABELS = {
  bookingEvents: "Bookings & appointments",
  reminderEvents: "Reminders",
  paymentEvents: "Payments",
  consultationEvents: "Consultations",
  cancellationEvents: "Cancellations & rescheduling",
  staffEvents: "Staff & HR",
  queueEvents: "Queue & arrivals",
  systemEvents: "System alerts",
} as const;

type Prefs = Record<keyof typeof LABELS, boolean>;

export function NotificationPreferences({ userId, relevantKeys }: { userId: string; relevantKeys?: (keyof typeof LABELS)[] }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getNotificationPreferences(userId).then((p) => {
      setPrefs({
        bookingEvents: p.bookingEvents,
        reminderEvents: p.reminderEvents,
        paymentEvents: p.paymentEvents,
        consultationEvents: p.consultationEvents,
        cancellationEvents: p.cancellationEvents,
        staffEvents: p.staffEvents,
        queueEvents: p.queueEvents,
        systemEvents: p.systemEvents,
      });
    });
  }, [userId]);

  if (!prefs) return null;

  const keys = (relevantKeys ?? (Object.keys(LABELS) as (keyof typeof LABELS)[]));

  async function toggle(key: keyof typeof LABELS) {
    if (!prefs) return;
    const next: Prefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    await updateNotificationPreferences(next);
    setSaving(null);
  }

  return (
    <div className="mt-2 space-y-1.5">
      {keys.map((key) => (
        <label key={key} className="flex items-center justify-between text-xs text-ink-soft">
          <span>{LABELS[key]}</span>
          <input
            type="checkbox"
            checked={prefs[key]}
            onChange={() => toggle(key)}
            disabled={saving === key}
          />
        </label>
      ))}
    </div>
  );
}
