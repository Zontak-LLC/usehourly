const DOLLAR_FINE_STEP = 100;
const DOLLAR_FINE_TOP = 3000;
const DOLLAR_COARSE_STEP = 500;
const DOLLAR_TOP = 10000;
const HOUR_FINE_STEP = 1;
const HOUR_FINE_TOP = 60;
const HOUR_COARSE_STEP = 5;
const HOUR_TOP = 200;

function buildStops(fineStep: number, fineTop: number, coarseStep: number, top: number): readonly number[] {
  const stops: number[] = [];
  for (let v = 0; v <= fineTop; v += fineStep) stops.push(v);
  for (let v = fineTop + coarseStep; v <= top; v += coarseStep) stops.push(v);
  return stops;
}

/** Slider stops for a dollar budget: $100 apart up to $3,000 (two thirds of the track), then $500 apart up to $10,000. */
export const DOLLAR_BUDGET_STOPS = buildStops(DOLLAR_FINE_STEP, DOLLAR_FINE_TOP, DOLLAR_COARSE_STEP, DOLLAR_TOP);

/** Slider stops for an hours budget: 1 h apart up to 60 h (two thirds of the track), then 5 h apart up to 200 h. */
export const HOUR_BUDGET_STOPS = buildStops(HOUR_FINE_STEP, HOUR_FINE_TOP, HOUR_COARSE_STEP, HOUR_TOP);

/** The stops for a budget unit. */
export function budgetStopsFor(hours: boolean): readonly number[] {
  return hours ? HOUR_BUDGET_STOPS : DOLLAR_BUDGET_STOPS;
}

/** Index of the stop nearest to `value` (ties go to the lower stop). Not a number gives 0; out of range clamps to the ends. */
export function budgetStopIndex(value: number, stops: readonly number[]): number {
  if (!Number.isFinite(value)) return 0;
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - value) < Math.abs(stops[best] - value)) best = i;
  }
  return best;
}
