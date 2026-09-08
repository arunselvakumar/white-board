import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await auth.protect();

  return <OnboardingShell>{children}</OnboardingShell>;
}
