import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy | UseHourly",
  description: "What UseHourly stores about you and what it does with it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 2026">
      <p>
        UseHourly is a free time tracking app run by Zontak LLC. This page says in plain words what we keep and why.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>
          Your account details: your name, your email address and your sign-in credentials. If you sign in with Google
          or GitHub, we receive your name, your verified email address and your account number with them, and nothing
          else; we cannot see your email, files or repositories there.
        </li>
        <li>What you enter: clients, projects, time entries, notes, rates and invoices.</li>
        <li>
          If you connect an AI assistant (with an access token you make, or by approving an app), we keep the
          connection's name, whether it may change things, when it expires and when it was last used. We keep only a
          fingerprint of the token itself, never the token. You can delete a connection on the Account page at any time,
          and changing your password ends them all.
        </li>
        <li>
          To stop abuse such as password guessing and mass sign-ups, we count some requests per internet address (and
          per account). Each count is kept with the address only for its short time window (an hour at most) and is
          deleted automatically within a few hours. It is not used for anything else.
        </li>
        <li>
          Sample-data demo accounts (&ldquo;Try it with sample data&rdquo;) are temporary and are deleted automatically
          after about a day, unless you turn one into a real account.
        </li>
      </ul>
      <h2>What we do with it</h2>
      <ul>
        <li>We use it only to run the app for you: to show your timesheets, reports, invoices and exports.</li>
        <li>We do not sell your data, we do not show ads, and we do not share your entries with anyone.</li>
        <li>
          We count how many times each page of the app is opened, per day, to see which parts are used. The count holds
          no name, email address, account identifier or anything you type, and uses no cookies.
        </li>
        <li>
          If you choose to polish descriptions with your own AI key, the key stays in your browser and is never sent to
          us. Your browser sends that one description and the project and client names to the service you chose
          (Anthropic or OpenAI), under your own account with them, and only when you press Polish.
        </li>
        <li>
          If you import a calendar file on the Today page, it is read in your browser. Only the title, start and end of
          recent meetings are kept, in your browser, and they are removed when you log out or remove the calendar. The
          file itself and the meetings are never sent to us. If you connect a calendar by its private address instead,
          the address is kept only in your browser, and each time the calendar is read the address passes through our
          server once, to fetch it from Google, Outlook or iCloud (they do not let a web page read it directly). We do
          not store or log the address or the calendar. If you press Connect Google Calendar, Google's own sign-in
          window asks you to allow UseHourly to read your calendar events (read-only). Your browser then reads your
          events straight from Google; the access Google gives lasts about an hour, is kept only in your browser's
          memory, and never reaches our servers. Only the title, start and end of recent meetings are kept, in your
          browser, until you log out or press Disconnect. You can also remove UseHourly's access any time at
          myaccount.google.com/permissions.
        </li>
        <li>We may email you about your account (for example, a password reset). We do not send marketing email.</li>
      </ul>
      <h2>Cookies and your browser</h2>
      <ul>
        <li>
          We use one cookie to keep you signed in, and a few small cookies that remember display choices such as light
          or dark mode. We use no advertising or tracking cookies.
        </li>
        <li>
          Some conveniences, such as the project you used last, are remembered in your browser's own storage. They stay
          on your device.
        </li>
        <li>
          Cloudflare Web Analytics counts visits to our pages. It uses no cookies and does not follow you across other
          sites.
        </li>
      </ul>
      <h2>Where it lives</h2>
      <p>
        Your data is stored with our hosting provider, Cloudflare. Our emails are sent by Resend, an email service,
        which receives your address and the message to deliver it. When the sign-up robot check is on, it is run by
        Cloudflare Turnstile. Donations are handled by GitHub Sponsors, which has its own privacy policy; we never see
        your payment details.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>You can export everything you have entered at any time from the Account page.</li>
        <li>
          You can delete your account yourself on the Account page, in the Delete account card under Profile. That
          removes your clients, projects, time entries, invoices and settings from our database straight away. Backups
          kept by our hosting provider for disaster recovery expire on their own within 30 days.
        </li>
        <li>If an email address bounces or is reported as spam, we stop sending reminders to it.</li>
      </ul>
      <h2>Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:admin@zontakllc.com" className="inline-block py-1">
          admin@zontakllc.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
