import { protectCompany } from "@repo/auth/construction/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { pickAuthPhoto } from "@/components/auth/auth-photos";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { OnboardingSplitShell } from "@/components/onboarding/onboarding-shell";
import { mustChangePassword } from "@/lib/must-change-password";
import { continuePath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Choose your own password" };

/**
 * The first stop after signing in with a Temporary Password (ADR CM-0029
 * §8); `/app`, Choose Company and Create Company send the User here until
 * it is replaced.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const auth = await protectCompany();
  const { redirect_url: redirectUrl = null } = await searchParams;
  if (!mustChangePassword(auth)) redirect(continuePath(redirectUrl));
  return (
    <OnboardingSplitShell photo={pickAuthPhoto()}>
      <ChangePasswordForm redirectUrl={redirectUrl} />
    </OnboardingSplitShell>
  );
}
