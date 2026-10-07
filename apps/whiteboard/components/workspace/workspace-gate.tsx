"use client";

import { useAuth, useWorkspaceList } from "@repo/auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";
import { mustLeaveAppPath } from "@/lib/workspace-access";

const ACTIVATION_ERROR =
  "Could not switch to that workspace. Please try again.";

function withRedirect(path: string, redirectUrl: string): string {
  return redirectUrl === "/"
    ? path
    : `${path}?redirect_url=${encodeURIComponent(redirectUrl)}`;
}

/**
 * The Workspace Gate (CONTEXT.md): zero Workspaces → Workspace Creation, one
 * and none active → activate it, several and none active → Workspace
 * Selection, an Active Workspace → the page. A screen the role may not use
 * sends the User to the In-app Home instead.
 */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, role } = useAuth();
  const { workspaces, setActive } = useWorkspaceList();
  const [activationError, setActivationError] = useState<string | undefined>();
  const [retryNonce, setRetryNonce] = useState(0);
  const attempted = useRef<number | null>(null);

  const redirectUrl = postWorkspacePath(pathname);
  const leavePage = workspaceId != null && mustLeaveAppPath(pathname, role);

  useEffect(() => {
    if (leavePage) router.replace("/");
  }, [leavePage, router]);

  const soleWorkspaceId =
    workspaces.length === 1 ? (workspaces[0]?.id ?? null) : null;

  useEffect(() => {
    if (workspaceId != null) return;
    if (workspaces.length === 0) {
      router.replace(withRedirect("/create-workspace", redirectUrl));
      return;
    }
    if (workspaces.length > 1) {
      router.replace(withRedirect("/select-workspace", redirectUrl));
      return;
    }
    if (soleWorkspaceId == null || attempted.current === retryNonce) return;
    attempted.current = retryNonce;
    void setActive(soleWorkspaceId, redirectUrl).then(({ error }) => {
      if (error != null) setActivationError(ACTIVATION_ERROR);
    });
  }, [
    redirectUrl,
    retryNonce,
    router,
    setActive,
    soleWorkspaceId,
    workspaceId,
    workspaces.length,
  ]);

  if (activationError != null && workspaceId == null) {
    return (
      <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-6">
        <FormAlert message={activationError} />
        <Button
          type="button"
          onClick={() => {
            setActivationError(undefined);
            setRetryNonce((nonce) => nonce + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (workspaceId == null || leavePage) {
    return <LoadingScreen />;
  }

  return children;
}
