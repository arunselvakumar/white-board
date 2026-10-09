import {
  getCompanyAuth,
  isConstructionSmsEnabled,
} from "@repo/auth/construction/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { continuePath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url: redirectUrl = null } = await searchParams;
  const auth = await getCompanyAuth();
  if (auth.isAuthenticated) redirect(continuePath(redirectUrl));
  return (
    <SignUpForm
      redirectUrl={redirectUrl}
      mobileOtp={isConstructionSmsEnabled()}
    />
  );
}
