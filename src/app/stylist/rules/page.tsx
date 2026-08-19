import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { staffRules, staffRuleAcknowledgements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { EmptyState } from "@/components/ui/EmptyState";
import { AcknowledgeButton } from "./AcknowledgeButton";

export default async function StylistRulesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const rules = await db.select().from(staffRules).where(eq(staffRules.active, true));
  const acks = await db
    .select()
    .from(staffRuleAcknowledgements)
    .where(eq(staffRuleAcknowledgements.staffId, user.id));

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-xl text-ink">Staff rules & regulations</h1>
      {rules.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No rules published yet." description="Staff policies will appear here once added by the owner." />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rules.map((rule) => {
            const acknowledged = acks.some((a) => a.ruleId === rule.id && a.ruleVersion === rule.version);
            return (
              <div key={rule.id} className="rounded-card border border-line bg-surface p-4">
                <p className="text-xs uppercase tracking-wide2 text-bronze-500">{rule.category}</p>
                <p className="mt-1 text-sm font-medium text-ink">{rule.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{rule.body}</p>
                <div className="mt-3">
                  {acknowledged ? (
                    <span className="text-xs text-moss">Acknowledged ✓</span>
                  ) : (
                    <AcknowledgeButton ruleId={rule.id} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
