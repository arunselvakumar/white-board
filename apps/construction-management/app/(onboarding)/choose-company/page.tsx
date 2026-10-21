import { companies, protectCompany } from "@repo/auth/construction/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChooseCompanyForm } from "@/components/onboarding/choose-company-form";
import { JoinRequestsList } from "@/components/onboarding/join-requests-list";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Choose a Company" };

export default async function ChooseCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const auth = await protectCompany();
  // Nothing to choose yet: a new User creates their Company first.
  const mine = await companies.listForUser(auth.userId);
  if (mine.length === 0) redirect("/create-company");

  const { redirect_url: redirectUrl = null } = await searchParams;
  return (
    <OnboardingShell>
      <ChooseCompanyForm
        redirectUrl={redirectUrl}
        joinRequests={
          // Most Users have no pending Join Request; the list renders
          // nothing then, so a skeleton would only flash and vanish.
          <QuerySuspense fallback={null}>
            <JoinRequestsList />
          </QuerySuspense>
        }
      />
    </OnboardingShell>
  );
}
