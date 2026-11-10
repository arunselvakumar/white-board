import type { Metadata } from "next";

import { CompanyOwnershipScreen } from "@/app/app/_components/account/company-ownership-screen";

export const metadata: Metadata = { title: "Company" };

export default function CompanySettingsPage() {
  return <CompanyOwnershipScreen />;
}
