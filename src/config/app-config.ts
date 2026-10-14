import packageJson from "../../package.json";

export const APP_CONFIG = {
  name: "UseHourly",
  version: packageJson.version,
  copyright: `© ${new Date().getFullYear()} UseHourly.`,
  meta: {
    title: "UseHourly — time tracking for freelancers",
    description: "Log your day in seconds. Quick entry, a start/stop timer and a weekly timesheet.",
  },
};
