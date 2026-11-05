import { feature } from "@/lib/features";

import { LayoutControls } from "./layout-controls";
import { ThemeSwitcher } from "./theme-switcher";

/**
 * The appearance button in the top bar: the sun/moon switch, or the full gear menu when the extra appearance settings
 * (font, layout, menu position) are switched on in lib/features.ts.
 */
export function AppearanceControl() {
  return feature("appearanceExtras") ? <LayoutControls /> : <ThemeSwitcher />;
}
