"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await login(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(next);
          router.refresh();
        });
      }}
    >
      <Input label="Phone or email" name="identifier" placeholder="e.g. 024xxxxxxx" required />
      <Input label="Password" name="password" type="password" required />
      {error && (
        <p className="rounded-sm bg-rust/10 px-3 py-2 text-sm text-rust" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
