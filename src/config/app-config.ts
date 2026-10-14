import packageJson from "../../package.json";

export const APP_CONFIG = {
  name: "UseHourly",
  version: packageJson.version,
  copyright: `© ${new Date().getFullYear()} UseHourly.`,
  meta: {
    title: "UseHourly: free time tracking for freelancers",
    description:
      "A free time tracking app for freelancers. Log your day in seconds, with a start/stop timer and a weekly timesheet.",
  },
};
