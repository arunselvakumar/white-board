import { getAuth } from "@repo/auth/server";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/app/(public)/forgot-password/_components/forgot-password-form";
import { workspaceEntryPath } from "@/lib/workspace-entry";

export default async function ForgotPasswordPage() {
  const { isAuthenticated } = await getAuth();
  if (isAuthenticated) {
    redirect(workspaceEntryPath("/"));
  }

  return <ForgotPasswordForm />;
}
