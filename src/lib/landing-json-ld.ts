/**
 * The landing page's schema.org description, for search engines. Its own module so the test fixture
 * (src/__tests__/fixtures/landing-page.ts) can hash the exact text the page ships (a Next.js page file may only export what Next.js reads).
 */
export const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "UseHourly",
  url: "https://usehourly.app",
  description:
    "Intuitive time tracking. Free. Type 1.5, press Enter, done. Timesheets, invoices and a tax summary from your hours, and a built-in MCP server so Claude, ChatGPT, Cursor and others can log time for you.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Quick daily time entry, with a timer when you want one",
    "Weekly timesheet that shows the gaps, and a month calendar you can drag entries across",
    "Invoices as PDF or as a private link, with paid, waiting and late at a glance",
    "Each client's month in hours and money, and one tap to make the invoice",
    "Year summary for taxes and Excel export",
    "Works offline and installs like an app",
    "Export all your data, or delete it",
    "MCP server: your AI assistant can log time, build timesheets for clients and prepare invoices",
  ],
};
