import { protect } from "@repo/auth/server";
import type { ReactNode } from "react";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await protect();

  return <OnboardingShell>{children}</OnboardingShell>;
}
