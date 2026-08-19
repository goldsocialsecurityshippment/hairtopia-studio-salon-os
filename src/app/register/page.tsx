import Link from "next/link";
import Image from "next/image";
import { RegisterForm } from "./RegisterForm";
import { Card } from "@/components/ui/Card";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/brand/hairtopia-logo.jpg" alt="Hairtopia Studio" width={56} height={56} className="rounded-full" />
          <h1 className="mt-4 font-display text-2xl text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-ink-soft">Book faster and track your appointment history.</p>
        </div>
        <Card className="p-6">
          <RegisterForm />
        </Card>
        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-bronze-500 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm">
          <Link href="/" className="text-ink-soft hover:text-ink">
            ← Back to homepage
          </Link>
        </p>
      </div>
    </div>
  );
}
