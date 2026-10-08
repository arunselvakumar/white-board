import { getCompanyAuth } from "@repo/auth/construction/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { continuePath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url: redirectUrl = null } = await searchParams;
  const auth = await getCompanyAuth();
  if (auth.isAuthenticated) redirect(continuePath(redirectUrl));
  return <SignInForm redirectUrl={redirectUrl} />;
}
