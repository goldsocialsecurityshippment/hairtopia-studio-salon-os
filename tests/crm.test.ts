import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/db";
import { clients, appointments, services, serviceCategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findOrCreateClient, assertClientAccess } from "@/lib/crm";
import { getClientForViewer, searchClients } from "@/lib/actions/crm";
import { signInAs, signOut, makeUser } from "./helpers";

describe("CRM: client matching and duplicate prevention", () => {
  it("creates a new client for an unknown phone number", async () => {
    const { client, created } = await findOrCreateClient({ fullName: "New Person", phone: "0209990001" });
    expect(created).toBe(true);
    expect(client.phone).toBe("+233209990001");
  });

  it("matches the SAME client regardless of phone formatting — no duplicate created", async () => {
    const first = await findOrCreateClient({ fullName: "Ama Test", phone: "0209990002" });
    const second = await findOrCreateClient({ fullName: "Ama T.", phone: "+233 20 999 0002" });
    const third = await findOrCreateClient({ fullName: "A. Test", phone: "233-20-999-0002" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.client.id).toBe(first.client.id);
    expect(third.client.id).toBe(first.client.id);

    const rows = await db.select().from(clients).where(eq(clients.phone, "+233209990002"));
    expect(rows.length).toBe(1);
  });
});

describe("CRM: server-side privacy enforcement", () => {
  let clientId: string;
  let assignedStylist: Awaited<ReturnType<typeof makeUser>>;
  let otherStylist: Awaited<ReturnType<typeof makeUser>>;
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let manager: Awaited<ReturnType<typeof makeUser>>;
  let clientCustomer: Awaited<ReturnType<typeof makeUser>>;
  let otherCustomer: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    assignedStylist = await makeUser("stylist", "Assigned Stylist");
    otherStylist = await makeUser("stylist", "Unrelated Stylist");
    owner = await makeUser("owner");
    admin = await makeUser("admin");
    manager = await makeUser("manager");
    clientCustomer = await makeUser("customer", "The Client");
    otherCustomer = await makeUser("customer", "Someone Else");

    const { client } = await findOrCreateClient({
      fullName: "Private Client",
      phone: "0209990003",
      linkedUserId: clientCustomer.id,
    });
    clientId = client.id;
    await db.update(clients).set({ notes: "PRIVATE FRONT-OF-HOUSE NOTE", allergies: "Latex" }).where(eq(clients.id, clientId));

    const [cat] = await db.insert(serviceCategories).values({ name: "CRM Cat " + Math.random() }).returning();
    const [svc] = await db.insert(services).values({ categoryId: cat.id, name: "CRM Svc", priceMin: 100, durationMinutes: 60 }).returning();
    await db.insert(appointments).values({
      clientId,
      customerName: "Private Client",
      customerPhone: "+233209990003",
      serviceId: svc.id,
      stylistId: assignedStylist.id,
      scheduledDate: "2027-02-01",
      scheduledTime: "10:00",
      durationMinutes: 60,
      priceEstimate: 100,
    });
  });

  afterEach(() => signOut());

  it("owner gets FULL access", async () => {
    expect((await assertClientAccess({ userId: owner.id, role: "owner", name: "o" }, clientId)).scope).toBe("full");
  });

  it("trusted admin gets FULL access", async () => {
    expect((await assertClientAccess({ userId: admin.id, role: "admin", name: "a" }, clientId)).scope).toBe("full");
  });

  it("the ASSIGNED stylist gets restricted 'assigned' access", async () => {
    const res = await assertClientAccess({ userId: assignedStylist.id, role: "stylist", name: "s" }, clientId);
    expect(res.allowed).toBe(true);
    expect(res.scope).toBe("assigned");
  });

  it("an UNRELATED stylist is denied entirely", async () => {
    const res = await assertClientAccess({ userId: otherStylist.id, role: "stylist", name: "s2" }, clientId);
    expect(res.allowed).toBe(false);
  });

  it("the client themselves gets 'self' access; a DIFFERENT customer is denied", async () => {
    expect((await assertClientAccess({ userId: clientCustomer.id, role: "customer", name: "c" }, clientId)).scope).toBe("self");
    expect((await assertClientAccess({ userId: otherCustomer.id, role: "customer", name: "c2" }, clientId)).allowed).toBe(false);
  });

  it("getClientForViewer: owner sees the private front-of-house notes", async () => {
    await signInAs({ id: owner.id, role: "owner", name: "o" });
    const data = await getClientForViewer(clientId);
    expect((data?.client as { notes?: string }).notes).toBe("PRIVATE FRONT-OF-HOUSE NOTE");
  });

  it("getClientForViewer: assigned stylist does NOT receive the private notes (server-side redaction), but still sees allergies", async () => {
    await signInAs({ id: assignedStylist.id, role: "stylist", name: "s" });
    const data = await getClientForViewer(clientId);
    expect(data).not.toBeNull();
    expect((data!.client as { notes?: string }).notes).toBeUndefined();
    expect((data!.client as { allergies?: string }).allergies).toBe("Latex");
  });

  it("getClientForViewer: unrelated stylist gets NOTHING (null), not a redacted record", async () => {
    await signInAs({ id: otherStylist.id, role: "stylist", name: "s2" });
    expect(await getClientForViewer(clientId)).toBeNull();
  });

  it("getClientForViewer: unauthenticated request gets nothing", async () => {
    signOut();
    expect(await getClientForViewer(clientId)).toBeNull();
  });

  it("searchClients (full client list) rejects a stylist outright", async () => {
    await signInAs({ id: assignedStylist.id, role: "stylist", name: "s" });
    await expect(searchClients("")).rejects.toThrow("FORBIDDEN");
  });

  it("searchClients rejects a customer outright", async () => {
    await signInAs({ id: clientCustomer.id, role: "customer", name: "c" });
    await expect(searchClients("")).rejects.toThrow("FORBIDDEN");
  });

  it("searchClients works for a manager", async () => {
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    const results = await searchClients("Private Client");
    expect(results.length).toBeGreaterThan(0);
  });
});
