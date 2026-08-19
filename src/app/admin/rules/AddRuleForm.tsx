"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStaffRule } from "@/lib/actions/catalogue";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const CATEGORIES = [
  "Customer Service",
  "Attendance",
  "Professional Conduct",
  "Service Standards",
  "Phone Usage",
  "Salon Cleanliness",
  "Customer Privacy",
  "Photography",
  "Payment Handling",
  "Workplace Conduct",
];

export function AddRuleForm() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    await addStaffRule({ category, title, body });
    setPending(false);
    setTitle("");
    setBody("");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg text-ink">Add a rule</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea label="Details" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
        <Button type="submit" className="w-full" loading={pending}>Publish rule</Button>
      </form>
    </Card>
  );
}
