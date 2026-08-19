import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { staffRules, staffRuleAcknowledgements, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AddRuleForm } from "./AddRuleForm";
import { Card } from "@/components/ui/Card";

export default async function AdminRulesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") redirect("/admin");

  const rules = await db.select().from(staffRules);
  const acks = await db.select().from(staffRuleAcknowledgements);
  const staff = await db.select().from(users).where(eq(users.role, "stylist"));

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Staff rules & regulations</h1>
      <p className="mt-1 text-sm text-ink-soft">Published rules require staff acknowledgement.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {rules.map((rule) => {
            const ackCount = acks.filter((a) => a.ruleId === rule.id && a.ruleVersion === rule.version).length;
            return (
              <Card key={rule.id} className="p-5">
                <p className="text-xs uppercase tracking-wide2 text-bronze-500">{rule.category} · v{rule.version}</p>
                <p className="mt-1 text-sm font-medium text-ink">{rule.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{rule.body}</p>
                <p className="mt-2 text-xs text-ink-soft">
                  Acknowledged by {ackCount} of {staff.length} stylists
                </p>
              </Card>
            );
          })}
          {rules.length === 0 && <p className="text-sm text-ink-soft">No rules published yet.</p>}
        </div>
        <AddRuleForm />
      </div>
    </div>
  );
}
