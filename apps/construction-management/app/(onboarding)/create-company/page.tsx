import { protectCompany } from "@repo/auth/construction/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthDivider } from "@/components/auth/auth-divider";
import { pickAuthPhoto } from "@/components/auth/auth-photos";
import { CreateCompanyWizard } from "@/components/onboarding/create-company-wizard";
import { JoinRequestsList } from "@/components/onboarding/join-requests-list";
import { OnboardingSplitShell } from "@/components/onboarding/onboarding-shell";
import { QuerySuspense } from "@/components/query-suspense";
import {
  CHANGE_PASSWORD_PATH,
  mustChangePassword,
} from "@/lib/must-change-password";

export const metadata: Metadata = { title: "Create a Company" };

/**
 * Where a User with no Company lands after sign-in. Pending Join Requests
 * sit above the wizard, so an invited Team Member can accept instead.
 */
export default async function CreateCompanyPage() {
  if (mustChangePassword(await protectCompany()))
    redirect(CHANGE_PASSWORD_PATH);
  return (
    <OnboardingSplitShell photo={pickAuthPhoto()}>
      <QuerySuspense fallback={null}>
        <JoinRequestsList after={<AuthDivider />} />
      </QuerySuspense>
      <CreateCompanyWizard />
    </OnboardingSplitShell>
  );
}
