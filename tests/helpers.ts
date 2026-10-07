import { SignJWT } from "jose";
import { db } from "@/db";
import { users } from "@/db/schema";

type Role = "customer" | "stylist" | "manager" | "owner" | "admin";

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me");

/** Makes subsequent server-action calls run as this user, via a real signed JWT. */
export async function signInAs(user: { id: string; role: Role; name: string }) {
  const token = await new SignJWT({ userId: user.id, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
  (globalThis as { __testSessionToken?: string }).__testSessionToken = token;
}

export function signOut() {
  (globalThis as { __testSessionToken?: string }).__testSessionToken = undefined;
}

let counter = 0;
export async function makeUser(role: Role, name?: string) {
  counter++;
  const [u] = await db
    .insert(users)
    .values({
      role,
      name: name ?? `Test ${role} ${counter}`,
      phone: `+2332${String(Date.now()).slice(-7)}${counter}`.slice(0, 13),
      passwordHash: "x",
    })
    .returning();
  return u;
}
