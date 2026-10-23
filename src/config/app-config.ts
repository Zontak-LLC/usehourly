import packageJson from "../../package.json";

export const APP_CONFIG = {
  name: "UseHourly",
  version: packageJson.version,
  copyright: `© ${new Date().getFullYear()} Zontak LLC`,
  meta: {
    title: "UseHourly: the free time tracker you don't have to learn",
    description:
      "A free, simple time tracker. Type 1.5, press Enter, done. Your hours become timesheets, invoices and a tax summary.",
  },
};
