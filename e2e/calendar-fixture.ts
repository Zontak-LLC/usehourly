/** A small calendar for the browser tests: meetings today, built in the page so they use its local day. */
export const icsFor = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const stamp = (h: number, m: number) =>
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), h, m)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const event = (uid: string, title: string, from: string, to: string, extra: string[] = []) =>
      ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${from}`, `DTEND:${to}`, `SUMMARY:${title}`, ...extra, "END:VEVENT"].join(
        "\r\n",
      );
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      event("m1", "Offline Co planning", stamp(10, 0), stamp(10, 45)),
      event("m2", "Dentist", stamp(13, 0), stamp(14, 0)),
      event("m3", "Focus time", stamp(15, 0), stamp(16, 0), ["TRANSP:TRANSPARENT"]),
      event("m4", "Cancelled call", stamp(16, 0), stamp(17, 0), ["STATUS:CANCELLED"]),
      "END:VCALENDAR",
    ].join("\r\n");
  });
