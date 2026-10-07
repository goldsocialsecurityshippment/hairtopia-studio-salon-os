"use client";

import { useEffect, useState } from "react";
import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush, setPushPreference } from "@/lib/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

type Status = "checking" | "unsupported" | "not_configured" | "subscribed" | "unsubscribed";

/** A real toggle for enabling/disabling phone push notifications — not a
 * decorative switch. Handles every honest outcome: unsupported browser/OS,
 * VAPID not configured on the server, permission denied, and the normal
 * subscribe/unsubscribe flow. */
export function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        setStatus("not_configured");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setStatus(existing ? "subscribed" : "unsubscribed");
    }
    check().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setPending(true);
    setError(null);
    try {
      const publicKey = await getVapidPublicKey();
      if (!publicKey) throw new Error("Push is not configured on the server yet.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notification permission was not granted.");
        setPending(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON();
      await subscribeToPush({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
        userAgent: navigator.userAgent,
      });
      await setPushPreference(true);
      setStatus("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("unsubscribed");
    } finally {
      setPending(false);
    }
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return <p className="text-xs text-ink-soft">Push notifications aren&apos;t supported on this browser/device.</p>;
  }
  if (status === "not_configured") {
    return <p className="text-xs text-ink-soft">Push notifications aren&apos;t configured for this deployment yet.</p>;
  }

  return (
    <div>
      <button
        onClick={status === "subscribed" ? disable : enable}
        disabled={pending}
        className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40 disabled:opacity-50"
      >
        {pending ? "Working…" : status === "subscribed" ? "Disable notifications" : "Enable notifications"}
      </button>
      {error && <p className="mt-1 text-xs text-rust">{error}</p>}
    </div>
  );
}
