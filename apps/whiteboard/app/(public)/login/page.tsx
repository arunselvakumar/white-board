import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { workspaceEntryPath } from "@/lib/workspace-entry";

type LoginPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const raw = params.redirect_url;
  const redirectUrl = safeRedirectPath(Array.isArray(raw) ? raw[0] : raw);

  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect(workspaceEntryPath(redirectUrl));
  }

  return <LoginForm redirectUrl={redirectUrl} />;
}
