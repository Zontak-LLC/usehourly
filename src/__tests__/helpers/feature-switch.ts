import type * as Features from "@/lib/features";

type FeaturesModule = typeof Features;

/**
 * The real `@/lib/features` module with some switches turned on, for a hoisted `vi.mock` factory:
 * `vi.mock("@/lib/features", async (orig) => (await import("./helpers/feature-switch")).withFeatures(orig, ["signOff"]))`.
 * Every other switch keeps its real value. Returns the module to use in place of the real one.
 */
export async function withFeatures(
  importOriginal: <T>() => Promise<T>,
  on: Features.Feature[],
): Promise<FeaturesModule> {
  const real = await importOriginal<FeaturesModule>();
  const FEATURES = { ...real.FEATURES, ...Object.fromEntries(on.map((name) => [name, true])) };
  return { ...real, FEATURES, feature: (name) => FEATURES[name] } as FeaturesModule;
}
