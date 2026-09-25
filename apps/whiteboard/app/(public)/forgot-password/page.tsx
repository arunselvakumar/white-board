import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { workspaceEntryPath } from "@/lib/workspace-entry";

export default async function ForgotPasswordPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect(workspaceEntryPath("/"));
  }

  return <ForgotPasswordForm />;
}
