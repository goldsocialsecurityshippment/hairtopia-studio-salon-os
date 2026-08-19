"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markCustomerArrived } from "@/lib/actions/booking";
import { Button } from "@/components/ui/Button";

export function ArriveButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleArrive() {
    setPending(true);
    setMessage(null);

    const finish = async (lat?: number, lng?: number) => {
      const result = await markCustomerArrived({ appointmentId, lat, lng });
      setPending(false);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.verified
          ? "Arrival confirmed — your location was verified near the salon."
          : "Arrival recorded. We couldn't verify your location, but your stylist has been notified."
      );
      router.refresh();
    };

    if (!("geolocation" in navigator)) {
      await finish();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => finish(pos.coords.latitude, pos.coords.longitude),
      () => finish(), // permission denied or unavailable -> recorded without verification
      { timeout: 8000 }
    );
  }

  return (
    <div>
      <Button onClick={handleArrive} loading={pending} className="w-full sm:w-auto">
        I&apos;ve Arrived
      </Button>
      {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
