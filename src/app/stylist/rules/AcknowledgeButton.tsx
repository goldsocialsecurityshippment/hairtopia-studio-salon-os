"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeRule } from "@/lib/actions/catalogue";
import { Button } from "@/components/ui/Button";

export function AcknowledgeButton({ ruleId }: { ruleId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await acknowledgeRule(ruleId);
        setPending(false);
        router.refresh();
      }}
    >
      I acknowledge this rule
    </Button>
  );
}
