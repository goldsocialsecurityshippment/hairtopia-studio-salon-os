"use server";

import { db } from "@/db";
import { users, customerProfiles } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Please enter your full name."),
  phone: z.string().min(9, "Please enter a valid phone number."),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function registerCustomer(formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") || "",
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { name, phone, email, password } = parsed.data;

  const existing = await db
    .select()
    .from(users)
    .where(email ? or(eq(users.phone, phone), eq(users.email, email)) : eq(users.phone, phone));

  if (existing.length > 0) {
    return { ok: false, error: "An account with this phone number or email already exists." };
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      role: "customer",
      name,
      phone,
      email: email || null,
      passwordHash,
    })
    .returning();

  await db.insert(customerProfiles).values({ userId: user.id });

  await recordAudit({
    session: null,
    action: "customer_registered",
    entityType: "user",
    entityId: user.id,
  });

  await createSession({ userId: user.id, role: "customer", name: user.name });
  return { ok: true };
}

const loginSchema = z.object({
  identifier: z.string().min(3, "Enter your phone or email."),
  password: z.string().min(1, "Enter your password."),
});

export async function login(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { identifier, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, identifier), eq(users.phone, identifier)));

  if (!user) {
    return { ok: false, error: "We couldn't find an account with those details." };
  }
  if (!user.active) {
    return { ok: false, error: "This account has been deactivated. Please contact the salon." };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Incorrect password. Please try again." };
  }

  await createSession({ userId: user.id, role: user.role, name: user.name });

  // Record a system login event distinct from physical attendance (staff only).
  if (user.role === "stylist" || user.role === "manager" || user.role === "owner") {
    const { recordLogin } = await import("./attendance");
    await recordLogin(user.id);
  }

  return { ok: true };
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  return user ?? null;
}
