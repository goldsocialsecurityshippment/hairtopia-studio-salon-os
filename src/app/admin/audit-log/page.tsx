import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AdminAuditLogPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") redirect("/admin");

  const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(300);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Audit log</h1>
      <p className="mt-1 text-sm text-ink-soft">
        A record of significant actions across the system. Visible to the owner only.
      </p>

      {logs.length === 0 ? (
        <div className="mt-6"><EmptyState title="No activity recorded yet" /></div>
      ) : (
        <div className="mt-6 rounded-card border border-line bg-surface">
          <p className="border-b border-line px-4 py-2 text-xs text-ink-soft sm:hidden">
            Swipe the table sideways to see entity and before/after values →
          </p>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas/50 text-xs uppercase tracking-wide2 text-ink-soft">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Before</th>
                <th className="px-4 py-3">After</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 text-ink-soft">{log.userRole ?? "system"}</td>
                  <td className="px-4 py-3 text-ink">{log.action.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-ink-soft">{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-xs text-ink-soft">{log.beforeValue ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-xs text-ink-soft">{log.afterValue ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
