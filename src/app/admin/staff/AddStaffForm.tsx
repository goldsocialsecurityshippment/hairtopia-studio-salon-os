"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStaff } from "@/lib/actions/staff";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function AddStaffForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"stylist" | "manager">("stylist");
  const [category, setCategory] = useState<"hair_stylist" | "nail_technician" | "lash_technician" | "makeup_artist" | "other">("hair_stylist");
  const [specialties, setSpecialties] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempCredentials, setTempCredentials] = useState<{ phone: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await addStaff({ name, phone, email: email || undefined, role, category, specialties: specialties || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setTempCredentials({ phone, password: result.tempPassword });
    setName("");
    setPhone("");
    setEmail("");
    setSpecialties("");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg text-ink">Add staff member</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as "stylist" | "manager")}>
          <option value="stylist">Stylist</option>
          <option value="manager">Manager</option>
        </Select>
        {role === "stylist" && (
          <>
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
              <option value="hair_stylist">Hair Stylist</option>
              <option value="nail_technician">Nail Technician</option>
              <option value="lash_technician">Lash Technician</option>
              <option value="makeup_artist">Makeup Artist</option>
              <option value="other">Other Beauty Professional</option>
            </Select>
            <Input
              label="Specialties (optional)"
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              placeholder="e.g. Braids, Retouch"
            />
          </>
        )}
        {error && <p className="text-sm text-rust">{error}</p>}
        <Button type="submit" className="w-full" loading={pending}>
          Add staff member
        </Button>
      </form>

      {tempCredentials && (
        <div className="mt-4 rounded-sm bg-moss/10 p-3 text-xs text-ink">
          <p className="font-medium">Account created.</p>
          <p className="mt-1">Phone: {tempCredentials.phone}</p>
          <p>Temporary password: {tempCredentials.password}</p>
          <p className="mt-1 text-ink-soft">Share this securely — it won&apos;t be shown again.</p>
        </div>
      )}
    </Card>
  );
}
