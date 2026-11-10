import { getCompanyAuth } from "@repo/auth/construction/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/app/(public)/forgot-password/_components/forgot-password-form";
import { continuePath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const auth = await getCompanyAuth();
  if (auth.isAuthenticated) redirect(continuePath(null));
  return <ForgotPasswordForm />;
}
