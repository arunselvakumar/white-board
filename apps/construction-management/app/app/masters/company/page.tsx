import type { Metadata } from "next";

import { CompanyProfileScreen } from "@/components/company-profile/company-profile-screen";

export const metadata: Metadata = { title: "Company profile" };

export default function CompanyProfilePage() {
  return <CompanyProfileScreen />;
}
