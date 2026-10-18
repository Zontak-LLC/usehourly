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
          Your account details: your name, your email address and your sign-in credentials. If you sign in with GitHub,
          we receive your GitHub name, your verified email address and your GitHub account number, and nothing else; we
          cannot see your repositories.
        </li>
        <li>What you enter: clients, projects, time entries, notes, rates and invoices.</li>
      </ul>
      <h2>What we do with it</h2>
      <ul>
        <li>We use it only to run the app for you: to show your timesheets, reports, invoices and exports.</li>
        <li>We do not sell your data, we do not show ads, and we do not share your entries with anyone.</li>
        <li>
          We count how many times each page of the app is opened, per day, to see which parts are used. The count holds
          no name, email address, account identifier or anything you type, and uses no cookies.
        </li>
        <li>We may email you about your account (for example, a password reset). We do not send marketing email.</li>
      </ul>
      <h2>Where it lives</h2>
      <p>
        Your data is stored with our hosting provider, Cloudflare. Donations are handled by GitHub Sponsors, which has
        its own privacy policy; we never see your payment details.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>You can export everything you have entered at any time from the Account page.</li>
        <li>
          You can delete your account yourself at the bottom of “Your data” on the Account page. That removes your
          clients, projects, time entries, invoices and settings from our database straight away. Backups kept by our
          hosting provider for disaster recovery expire on their own within 30 days.
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
