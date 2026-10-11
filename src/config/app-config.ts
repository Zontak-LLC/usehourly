import packageJson from "../../package.json";

export const APP_CONFIG = {
  name: "Hourly",
  version: packageJson.version,
  copyright: `© ${new Date().getFullYear()} Hourly.`,
  meta: {
    title: "Hourly — time tracking for freelancers",
    description: "Log your day in seconds. Quick entry, a start/stop timer and a weekly timesheet.",
  },
};
