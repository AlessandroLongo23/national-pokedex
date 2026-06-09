import { Settings } from "lucide-react";
import { PageHeader } from "../_components/PageHeader";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { DisplayCurrencySetting } from "./_components/DisplayCurrencySetting";
import { PriceSourceSetting } from "./_components/PriceSourceSetting";
import { MegaSeparationSetting } from "./_components/MegaSeparationSetting";
import { VariantSeparationSetting } from "./_components/VariantSeparationSetting";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Per-account preferences. More options land as features grow."
      />
      <DisplayCurrencySetting initial={prefs.displayCurrency} />
      <PriceSourceSetting initial={prefs.priceSource} />
      <MegaSeparationSetting
        initialEnabled={prefs.treatMegasAsSeparate}
        initialPlacement={prefs.megaPlacement}
      />
      <VariantSeparationSetting
        initialEnabled={prefs.treatVariantsAsSeparate}
        initialPlacement={prefs.variantPlacement}
      />
    </div>
  );
}
