import type { Metadata } from "next";

import { CreateCompanyWizard } from "@/components/onboarding/create-company-wizard";

export const metadata: Metadata = { title: "Create a Company" };

export default function CreateCompanyPage() {
  return <CreateCompanyWizard />;
}
