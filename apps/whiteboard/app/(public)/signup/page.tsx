import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { workspaceEntryPath } from "@/lib/workspace-entry";

export default async function SignupPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect(workspaceEntryPath("/"));
  }

  return <SignupForm />;
}
