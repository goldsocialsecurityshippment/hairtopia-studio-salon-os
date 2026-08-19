"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCustomer } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await registerCustomer(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/account");
          router.refresh();
        });
      }}
    >
      <Input label="Full name" name="name" required />
      <Input label="Phone number" name="phone" required />
      <Input label="Email (optional)" name="email" type="email" />
      <Input label="Password" name="password" type="password" required minLength={6} />
      {error && (
        <p className="rounded-sm bg-rust/10 px-3 py-2 text-sm text-rust" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
