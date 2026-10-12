import { protectCompany } from "@repo/auth/construction/server";
import type { ReactNode } from "react";

/** Each onboarding screen brings its own shell; this only checks the Session. */
export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await protectCompany();
  return children;
}
