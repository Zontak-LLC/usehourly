/**
 * A project's colour as a bright line: a gradient from the colour to a lighter shade of it, with a soft glow. It is used on
 * the thin bars of the Today page (the day by project and the day's timesheet) so they catch the eye.
 */
export const brightLine = (color: string) => ({
  backgroundImage: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 60%, #ffffff))`,
  boxShadow: `0 0 10px -1px color-mix(in oklab, ${color} 55%, transparent)`,
});
