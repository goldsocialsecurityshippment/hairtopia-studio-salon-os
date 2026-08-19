import { getSettings } from "@/lib/data/queries";
import { SettingsForm } from "./SettingsForm";

export default async function AdminSettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Salon settings</h1>
      <p className="mt-1 max-w-lg text-sm text-ink-soft">
        Everything here drives the live site and booking rules — nothing about the salon is hard-coded.
      </p>
      <div className="mt-6 max-w-2xl">
        <SettingsForm settings={settings ?? null} />
      </div>
    </div>
  );
}
