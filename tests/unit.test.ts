import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/crm";
import { computeDeposit } from "@/lib/payments/provider";
import { checkRateLimit } from "@/lib/rate-limit";

describe("normalizePhone (CRM phone matching)", () => {
  it("normalizes a local 0-prefixed Ghanaian number", () => {
    expect(normalizePhone("0244123456")).toBe("+233244123456");
  });
  it("normalizes a number already in +233 form", () => {
    expect(normalizePhone("+233244123456")).toBe("+233244123456");
  });
  it("normalizes a number with spaces and dashes", () => {
    expect(normalizePhone("024-412-3456")).toBe("+233244123456");
  });
  it("normalizes a bare 233-prefixed number with no plus", () => {
    expect(normalizePhone("233244123456")).toBe("+233244123456");
  });
  it("produces the SAME normalized value for equivalent inputs (the actual dedup guarantee)", () => {
    const a = normalizePhone("0244123456");
    const b = normalizePhone("+233 244 123 456");
    const c = normalizePhone("233-244-123-456");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("computeDeposit", () => {
  const baseSettings = { depositEnabled: true, depositMode: "flat" as const, depositFlatAmount: 100, depositPercent: 20 };

  it("returns 0 when deposits are disabled", () => {
    expect(computeDeposit(500, { ...baseSettings, depositEnabled: false })).toBe(0);
  });
  it("returns the flat amount when the service costs more than the flat deposit", () => {
    expect(computeDeposit(250, baseSettings)).toBe(100);
  });
  it("never charges a deposit larger than the service price itself", () => {
    expect(computeDeposit(50, baseSettings)).toBe(50);
  });
  it("computes a percentage deposit correctly", () => {
    expect(computeDeposit(300, { ...baseSettings, depositMode: "percent", depositPercent: 20 })).toBe(60);
  });
});

describe("checkRateLimit", () => {
  it("allows requests under the limit and blocks once exceeded", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(false);
  });
  it("tracks independent keys separately", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    checkRateLimit(a, 1, 60_000);
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true);
  });
});
