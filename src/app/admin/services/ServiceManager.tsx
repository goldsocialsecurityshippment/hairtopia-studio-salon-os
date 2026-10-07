"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertService, setServiceActive, upsertVariation, deleteVariation, addCategory } from "@/lib/actions/catalogue";
import { publishServiceTerms, listServiceTermsHistory } from "@/lib/actions/service-terms";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

type Variation = { id: string; label: string; price: number };
type ServiceItem = {
  id: string;
  name: string;
  priceMin: number;
  priceMax: number | null;
  durationMinutes: number;
  active: boolean;
  variations: Variation[];
};
type Category = { id: string; name: string; services: ServiceItem[] };

/** Reusable, versioned Terms & Conditions editor for ANY service — used for
 * Bridal Makeup, but not hardcoded to it. Publishing a new version never
 * edits an old one in place, so a past appointment's accepted version stays
 * exactly what the customer agreed to. */
function ServiceTermsEditor({ serviceId }: { serviceId: string }) {
  const [history, setHistory] = useState<{ id: string; version: number; title: string; content: string; active: boolean }[] | null>(null);
  const [title, setTitle] = useState("Terms & Conditions");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listServiceTermsHistory(serviceId).then((rows) => {
      setHistory(rows);
      const active = rows.find((r) => r.active);
      if (active) {
        setTitle(active.title);
        setContent(active.content);
      }
    });
  }, [serviceId]);

  async function publish() {
    setPending(true);
    setError(null);
    const result = await publishServiceTerms({ serviceId, title, content });
    setPending(false);
    if (!result.ok) return setError(result.error);
    const rows = await listServiceTermsHistory(serviceId);
    setHistory(rows);
  }

  if (history === null) return <p className="mt-3 text-xs text-ink-soft">Loading terms…</p>;

  return (
    <div className="mt-3 rounded-sm bg-canvas p-3">
      {history.length > 0 && (
        <p className="mb-2 text-xs text-ink-soft">
          Current version: v{history.find((r) => r.active)?.version ?? "—"} · {history.length} version(s) on file
        </p>
      )}
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="mt-2 block">
        <span className="mb-1 block text-xs text-ink-soft">Content</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="w-full rounded-sm border border-line px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="mt-1 text-xs text-rust">{error}</p>}
      <Button size="sm" className="mt-2" loading={pending} disabled={!content.trim()} onClick={publish}>
        Publish new version
      </Button>
      <p className="mt-1 text-xs text-ink-soft">
        Publishing creates a new version and shows it to customers going forward — past bookings keep the
        version they originally accepted.
      </p>
    </div>
  );
}

function ServiceRow({ service, categoryId }: { service: ServiceItem; categoryId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [priceMin, setPriceMin] = useState(service.priceMin);
  const [priceMax, setPriceMax] = useState(service.priceMax ?? undefined);
  const [duration, setDuration] = useState(service.durationMinutes);
  const [pending, setPending] = useState(false);
  const [showVariations, setShowVariations] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [newVarLabel, setNewVarLabel] = useState("");
  const [newVarPrice, setNewVarPrice] = useState<number | undefined>(undefined);

  async function save() {
    setPending(true);
    await upsertService({
      id: service.id,
      categoryId,
      name: service.name,
      priceMin,
      priceMax,
      durationMinutes: duration,
      active: service.active,
    });
    setPending(false);
    setEditing(false);
    router.refresh();
  }

  async function toggleActive() {
    setPending(true);
    await setServiceActive(service.id, !service.active);
    setPending(false);
    router.refresh();
  }

  async function addVariation() {
    if (!newVarLabel || !newVarPrice) return;
    setPending(true);
    await upsertVariation({ serviceId: service.id, label: newVarLabel, price: newVarPrice });
    setPending(false);
    setNewVarLabel("");
    setNewVarPrice(undefined);
    router.refresh();
  }

  async function removeVariation(id: string) {
    setPending(true);
    await deleteVariation(id);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{service.name}</p>
          <p className="text-xs text-ink-soft">
            GH₵{service.priceMin}{service.priceMax ? `–${service.priceMax}` : "+"} · {service.durationMinutes} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={service.active ? "success" : "danger"}>{service.active ? "Active" : "Inactive"}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={toggleActive} loading={pending}>
            {service.active ? "Deactivate" : "Activate"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowVariations((v) => !v)}>
            Variations ({service.variations.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowTerms((t) => !t)}>
            Terms &amp; Conditions
          </Button>
        </div>
      </div>

      {showTerms && <ServiceTermsEditor serviceId={service.id} />}

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-sm bg-canvas p-3">
          <Input label="Min price (GH₵)" type="number" value={priceMin} onChange={(e) => setPriceMin(Number(e.target.value))} className="w-32" />
          <Input label="Max price (GH₵, optional)" type="number" value={priceMax ?? ""} onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : undefined)} className="w-32" />
          <Input label="Duration (min)" type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-32" />
          <Button size="sm" onClick={save} loading={pending}>Save</Button>
        </div>
      )}

      {showVariations && (
        <div className="mt-3 space-y-2 rounded-sm bg-canvas p-3">
          {service.variations.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-sm">
              <span className="text-ink">{v.label} — GH₵{v.price}</span>
              <Button size="sm" variant="ghost" onClick={() => removeVariation(v.id)} loading={pending}>Remove</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <Input label="New option label" value={newVarLabel} onChange={(e) => setNewVarLabel(e.target.value)} className="w-48" placeholder="e.g. Medium / 6 rows / BL" />
            <Input label="Price (GH₵)" type="number" value={newVarPrice ?? ""} onChange={(e) => setNewVarPrice(e.target.value ? Number(e.target.value) : undefined)} className="w-28" />
            <Button size="sm" onClick={addVariation} loading={pending}>Add option</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ServiceManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleAddCategory() {
    if (!newCategoryName) return;
    setPending(true);
    await addCategory(newCategoryName);
    setPending(false);
    setNewCategoryName("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <Card key={cat.id} className="p-5">
          <h2 className="font-display text-lg text-ink">{cat.name}</h2>
          <div className="mt-2">
            {cat.services.length === 0 ? (
              <p className="text-sm text-ink-soft">No services in this category yet.</p>
            ) : (
              cat.services.map((s) => <ServiceRow key={s.id} service={s} categoryId={cat.id} />)
            )}
          </div>
        </Card>
      ))}

      <Card className="p-5">
        <h2 className="font-display text-lg text-ink">Add a category</h2>
        <div className="mt-3 flex items-end gap-3">
          <Input label="Category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
          <Button onClick={handleAddCategory} loading={pending}>Add</Button>
        </div>
      </Card>
    </div>
  );
}
