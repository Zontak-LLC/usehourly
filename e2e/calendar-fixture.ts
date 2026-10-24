/** One meeting today: uid, title, start and end as [hour, minute], extra iCalendar lines. */
type Meeting = [uid: string, title: string, from: [number, number], to: [number, number], extra?: string[]];

const DEFAULT_MEETINGS: Meeting[] = [
  ["m1", "Offline Co planning", [10, 0], [10, 45]],
  ["m2", "Dentist", [13, 0], [14, 0]],
  ["m3", "Focus time", [15, 0], [16, 0], ["TRANSP:TRANSPARENT"]],
  ["m4", "Cancelled call", [16, 0], [17, 0], ["STATUS:CANCELLED"]],
];

/** A small calendar for the browser tests: meetings today, built in the page so they use its local day. */
export const icsFor = (page: import("@playwright/test").Page, meetings: Meeting[] = DEFAULT_MEETINGS) =>
  page.evaluate((list) => {
    const stamp = ([h, m]: [number, number]) =>
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), h, m)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const event = ([uid, title, from, to, extra = []]: Meeting) =>
      [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTART:${stamp(from)}`,
        `DTEND:${stamp(to)}`,
        `SUMMARY:${title}`,
        ...extra,
        "END:VEVENT",
      ].join("\r\n");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...list.map(event), "END:VCALENDAR"].join("\r\n");
  }, meetings);
