import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-calendar";

/**
 * Google's own sign-in popup (Google Identity Services), loaded only when the person presses Connect. It hands back a
 * read-only access token that lives about an hour; the token is kept in memory only and never written anywhere.
 */
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type Gis = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback: (e: { type?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
};
declare global {
  interface Window {
    google?: Gis;
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";
let token: string | null = null;
let loading: Promise<Gis> | null = null;

function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  loading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else {
        loading = null; // let the next press try again
        reject(new Error("Google sign-in didn't load."));
      }
    };
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Starts loading Google's script ahead of the press. The popup must open straight from the tap, and browsers such as
 * Safari block one that opens after a wait for a script, so the script is fetched as soon as the card is shown.
 */
export function preloadGoogleIdentity(): void {
  void loadGis().catch(() => undefined);
}

/** What to say when the popup ends without a token. */
export function explainPopupError(type: string | undefined): string {
  if (type === "popup_closed") return "The Google window was closed before it finished. Tap Connect again.";
  if (type === "popup_failed_to_open")
    return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
  return "Google didn't give access, so nothing was connected.";
}

/** Opens Google's popup and resolves with a read-only access token (kept in memory only). Must follow a tap. */
export async function requestGoogleToken(clientId: string): Promise<string> {
  const gis = await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (r) => {
        if (r.access_token) {
          token = r.access_token;
          resolve(r.access_token);
        } else reject(new Error(explainPopupError(r.error === "access_denied" ? "access_denied" : undefined)));
      },
      error_callback: (e) => reject(new Error(explainPopupError(e.type))),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/** Tells Google to stop honouring the token held in memory (Disconnect), and forgets it. */
export function revokeGoogleToken(): void {
  const t = token;
  token = null;
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t);
}
