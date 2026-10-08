import type { Metadata } from "next";

import { ChooseCompanyForm } from "@/components/onboarding/choose-company-form";

export const metadata: Metadata = { title: "Choose a Company" };

export default async function ChooseCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url: redirectUrl = null } = await searchParams;
  return <ChooseCompanyForm redirectUrl={redirectUrl} />;
}
