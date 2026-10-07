import { getAuth } from "@repo/auth/server";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { workspaceEntryPath } from "@/lib/workspace-entry";

type LoginPageProps = {
  searchParams: Promise<{
    redirect_url?: string | string[];
    error?: string | string[];
  }>;
};

/** Why Google sent the User back without a Session. */
function googleErrorMessage(code: string | undefined): string | undefined {
  if (code == null) return undefined;
  if (code === "account_not_linked")
    return "An account with this email already exists. Sign in with your password.";
  return "Google sign-in didn't finish. Please try again.";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const raw = params.redirect_url;
  const redirectUrl = safeRedirectPath(Array.isArray(raw) ? raw[0] : raw);
  const errorCode = Array.isArray(params.error)
    ? params.error[0]
    : params.error;

  const { isAuthenticated } = await getAuth();
  if (isAuthenticated) {
    redirect(workspaceEntryPath(redirectUrl));
  }

  return (
    <LoginForm
      redirectUrl={redirectUrl}
      initialError={googleErrorMessage(errorCode)}
    />
  );
}
