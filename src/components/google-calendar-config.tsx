"use client";

import { createContext, type ReactNode, useContext } from "react";

const GoogleCalendarContext = createContext<string | null>(null);

/**
 * The Google client id for "Connect Google Calendar", read on the server in the dashboard layout from
 * GOOGLE_CALENDAR_CLIENT_ID. null means the feature is not switched on (or this is a sample account), and the
 * calendar card shows only the file and private-address options. A client id is public by design (it is in the page
 * Google's popup opens from); there is no secret in the browser.
 */
export function GoogleCalendarProvider({ clientId, children }: { clientId: string | null; children: ReactNode }) {
  return <GoogleCalendarContext.Provider value={clientId}>{children}</GoogleCalendarContext.Provider>;
}

export const useGoogleCalendarClientId = () => useContext(GoogleCalendarContext);
