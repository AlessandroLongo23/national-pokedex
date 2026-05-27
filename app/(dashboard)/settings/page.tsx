import { PageHeader } from "../_components/PageHeader";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { PriceSourceSetting } from "./_components/PriceSourceSetting";
import { MegaSeparationSetting } from "./_components/MegaSeparationSetting";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Per-account preferences. More options land as features grow."
      />
      <PriceSourceSetting initial={prefs.priceSource} />
      <MegaSeparationSetting
        initialEnabled={prefs.treatMegasAsSeparate}
        initialPlacement={prefs.megaPlacement}
      />
    </div>
  );
}
