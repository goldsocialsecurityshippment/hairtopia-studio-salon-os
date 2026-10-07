import { NextRequest, NextResponse } from "next/server";
import { confirmMomoCallback } from "@/lib/actions/payments";

/**
 * MTN MoMo Collections webhook endpoint.
 *
 * HONEST STATUS ON VERIFICATION: MTN MoMo Collections' callback mechanism
 * (posting to the `X-Callback-Url` you registered) is NOT cryptographically
 * signed the way e.g. Stripe webhooks are — there is no HMAC signature
 * header MTN attaches for you to verify. Inventing one would be exactly
 * the "fake signature algorithm" we were told not to build. The actual
 * mechanisms MTN's own integration guidance supports are:
 *
 *   1. A shared secret YOU embed when registering the callback URL with
 *      MTN, checked here on every request. This is real, implemented, and
 *      testable right now — see MTN_MOMO_CALLBACK_SECRET below.
 *   2. Never trusting the callback body alone in production — MTN's own
 *      guidance is to treat a callback as a trigger to independently
 *      confirm via a server-to-server GET to MTN's "get transaction
 *      status" endpoint before treating money as settled. The provider
 *      abstraction already exposes `getPaymentStatus` for exactly this,
 *      but it is NOT force-wired into this route: with a stubbed provider
 *      (no real credentials), calling it would just return a hardcoded
 *      "pending" and make it impossible to exercise the paid/failed paths
 *      even in testing. When real MTN credentials are configured, this
 *      route should be updated to call `provider.getPaymentStatus(...)`
 *      and use ITS result instead of trusting `payload.status` — that's
 *      the one remaining wiring change needed at that point, not a redesign.
 *   3. IP allowlisting to MTN's published ranges — not implemented, since
 *      Vercel/most Node hosts don't expose the caller's real IP through a
 *      config file the way a traditional server firewall would; this is a
 *      platform-level (reverse proxy / WAF) concern, documented in the
 *      README rather than faked here.
 */
export async function POST(req: NextRequest) {
  const { checkRateLimit, clientKeyFromHeaders } = await import("@/lib/rate-limit");
  if (!checkRateLimit(clientKeyFromHeaders(req.headers, "momo-webhook"), 60, 60 * 1000).allowed) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }

  const configuredSecret = process.env.MTN_MOMO_CALLBACK_SECRET;
  if (configuredSecret) {
    const provided = req.headers.get("x-callback-secret");
    if (provided !== configuredSecret) {
      // Never say *why* it was rejected beyond this — no hints for probing.
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }
  // If MTN_MOMO_CALLBACK_SECRET is not set, this check is skipped — which
  // matches the rest of the MoMo stack's honest behavior (unconfigured =
  // clearly not production-ready, never silently "secure"). See
  // .env.example and the README's Security section.

  try {
    const payload = await req.json();
    const result = await confirmMomoCallback(payload);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ received: true, status: result.status });
  } catch {
    // Never leak parse/internal error detail to an inbound webhook caller.
    return NextResponse.json({ error: "Invalid callback payload." }, { status: 400 });
  }
}
