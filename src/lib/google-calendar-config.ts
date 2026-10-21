/**
 * The Google client id that "Connect Google Calendar" signs in with, or null while the feature is off. It is switched
 * on by setting GOOGLE_CALENDAR_CLIENT_ID (a Web application client from the Google Cloud project, with this site as an
 * authorised JavaScript origin and the calendar.events.readonly scope on its consent screen). Only a plausible client
 * id is passed to the browser: anything else keeps the feature off rather than showing a button that cannot work.
 */
export function googleCalendarClientId(): string | null {
  const id = (process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "").trim();
  return /^[0-9A-Za-z._-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}
