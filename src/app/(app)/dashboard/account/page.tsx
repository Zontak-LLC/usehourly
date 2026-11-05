import type { Metadata } from "next";

import { AccountView } from "./_components/account-view";

export const metadata: Metadata = { title: "Account · UseHourly" };

export default function AccountPage() {
  return <AccountView />;
}
