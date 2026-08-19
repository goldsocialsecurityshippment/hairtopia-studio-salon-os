type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink-soft",
  success: "bg-moss/10 text-moss",
  warning: "bg-amber/10 text-amber",
  danger: "bg-rust/10 text-rust",
  info: "bg-bronze-100 text-bronze-600",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "completed":
    case "approved":
    case "paid":
    case "on_time":
    case "checked_out":
      return "success";
    case "cancelled":
    case "no_show":
    case "issue_reported":
    case "disputed":
    case "absent":
      return "danger";
    case "in_service":
    case "arrived":
    case "late":
    case "needs_review":
    case "partial":
      return "warning";
    case "pending":
    case "pending_review":
    case "waiting":
    case "not_checked_in":
      return "info";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
