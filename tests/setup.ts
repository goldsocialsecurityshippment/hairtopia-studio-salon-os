import { vi } from "vitest";

/**
 * Mocks ONLY the Next.js framework boundaries that don't exist outside a
 * running Next server (cache revalidation, request headers, cookie store).
 * The app's own logic — database access, JWT session verification,
 * authorization, payments, availability — is always the real code. The
 * mocked cookie store simply hands back a genuinely-signed session token
 * (see tests/helpers.ts `signInAs`), so `getSession()`/`requireRole()` run
 * their real verification path.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `test-${Math.random()}` }),
  cookies: async () => ({
    get: (name: string) => {
      const token = (globalThis as { __testSessionToken?: string }).__testSessionToken;
      return token && name === "hairtopia_session" ? { value: token } : undefined;
    },
    set: () => {},
    delete: () => {},
  }),
}));
