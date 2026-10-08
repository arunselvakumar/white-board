import { protectCompany } from "@repo/auth/construction/server";
import type { ReactNode } from "react";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await protectCompany();
  return <OnboardingShell>{children}</OnboardingShell>;
}
