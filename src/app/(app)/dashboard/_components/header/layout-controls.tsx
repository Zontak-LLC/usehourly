"use client";

import { Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { feature } from "@/lib/features";
import { type FontKey, fontOptions } from "@/lib/fonts/registry";
import type { ContentLayout, NavbarStyle, NavPosition } from "@/lib/preferences/layout";
import type { ThemeMode } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function LayoutControls() {
  const { values, setPreference, resetPreferences } = usePreferencesStore(
    useShallow((state) => ({
      values: state.values,
      setPreference: state.setPreference,
      resetPreferences: state.resetPreferences,
    })),
  );

  const {
    theme_mode: themeMode,
    content_layout: contentLayout,
    navbar_style: navbarStyle,
    nav_position: navPosition,
    font,
  } = values;

  const onThemeModeChange = (mode: ThemeMode | "") => {
    if (!mode) return;
    setPreference("theme_mode", mode);
  };

  const onContentLayoutChange = (layout: ContentLayout | "") => {
    if (!layout) return;
    setPreference("content_layout", layout);
  };

  const onNavbarStyleChange = (style: NavbarStyle | "") => {
    if (!style) return;
    setPreference("navbar_style", style);
  };

  const onNavPositionChange = (position: NavPosition | "") => {
    if (!position) return;
    setPreference("nav_position", position);
  };

  const onFontChange = (value: FontKey | "") => {
    if (!value) return;
    setPreference("font", value);
  };

  // First release: only light, dark and system. The other choices stay in the code behind `appearanceExtras`;
  // "Restore Defaults" stays so someone who picked them earlier can get back to the normal look.
  const extras = feature("appearanceExtras");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" aria-label="Appearance and layout settings" title="Appearance and layout">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none">{extras ? "Preferences" : "Appearance"}</h4>
            <p className="text-muted-foreground text-xs">
              {extras ? "Customize your dashboard layout preferences." : "Light, dark, or the same as your device."}
            </p>
          </div>
          <div className="space-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
            {extras && (
              <div className="space-y-1">
                <Label className="font-medium text-xs">Fonts</Label>
                <Select value={font} onValueChange={onFontChange}>
                  <SelectTrigger size="sm" className="w-full text-xs">
                    <SelectValue placeholder="Select font" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {fontOptions.map((font) => (
                        <SelectItem key={font.key} className="text-xs" value={font.key}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="font-medium text-xs">Theme Mode</Label>
              <ToggleGroup
                size="sm"
                spacing={0}
                variant="outline"
                type="single"
                value={themeMode}
                onValueChange={onThemeModeChange}
              >
                <ToggleGroupItem value="light" aria-label="Toggle light">
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Toggle dark">
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" aria-label="Toggle system">
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {extras && (
              <>
                <div className="space-y-1">
                  <Label className="font-medium text-xs">Page Layout</Label>
                  <ToggleGroup
                    size="sm"
                    spacing={0}
                    variant="outline"
                    type="single"
                    value={contentLayout}
                    onValueChange={onContentLayoutChange}
                  >
                    <ToggleGroupItem value="centered" aria-label="Toggle centered">
                      Centered
                    </ToggleGroupItem>
                    <ToggleGroupItem value="full-width" aria-label="Toggle full-width">
                      Full Width
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="hidden space-y-1 lg:block">
                  <Label className="font-medium text-xs">Navigation</Label>
                  <ToggleGroup
                    size="sm"
                    spacing={0}
                    variant="outline"
                    type="single"
                    value={navPosition}
                    onValueChange={onNavPositionChange}
                  >
                    <ToggleGroupItem value="top" aria-label="Navigation along the top">
                      Top
                    </ToggleGroupItem>
                    <ToggleGroupItem value="left" aria-label="Navigation down the left">
                      Left
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="space-y-1">
                  <Label className="font-medium text-xs">Navbar Behavior</Label>
                  <ToggleGroup
                    size="sm"
                    spacing={0}
                    variant="outline"
                    type="single"
                    value={navbarStyle}
                    onValueChange={onNavbarStyleChange}
                  >
                    <ToggleGroupItem value="sticky" aria-label="Toggle sticky">
                      Sticky
                    </ToggleGroupItem>
                    <ToggleGroupItem value="scroll" aria-label="Toggle scroll">
                      Scroll
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </>
            )}

            <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={resetPreferences}>
              Restore Defaults
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
