import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of use | UseHourly",
  description: "The simple rules for using UseHourly.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="October 2026">
      <p>By using UseHourly you agree to these simple terms.</p>
      <h2>The service</h2>
      <ul>
        <li>UseHourly is free to use. Donations are optional and do not change what you get.</li>
        <li>It is provided as is, without a promise that it will always be available or free of mistakes.</li>
        <li>Please check your timesheets and invoices before you rely on them. They are your records.</li>
      </ul>
      <h2>Your account</h2>
      <ul>
        <li>Keep your password private. You are responsible for what happens under your account.</li>
        <li>Do not use UseHourly to break the law or to attack the service or other people.</li>
      </ul>
      <h2>Your data</h2>
      <p>
        What you enter belongs to you. You can export it at any time. See the <a href="/privacy">privacy policy</a> for
        how we handle it.
      </p>
      <h2>Changes and ending</h2>
      <p>
        We may change or end the service, and we will try to give notice and time to export your data first. You can
        stop using it at any time.
      </p>
      <h2>Liability</h2>
      <p>To the extent the law allows, Zontak LLC is not liable for losses that come from using the app.</p>
      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:admin@zontakllc.com">admin@zontakllc.com</a>.
      </p>
    </LegalPage>
  );
}
