"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";

const ACTIVATION_ERROR =
  "Could not switch to that workspace. Please try again.";

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { orgId } = useAuth();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  const [activationError, setActivationError] = useState<string | undefined>();
  const [retryNonce, setRetryNonce] = useState(0);

  const redirectUrl = postWorkspacePath(pathname);

  const membershipCount = userMemberships.count ?? 0;
  const soleOrganizationId = userMemberships.data?.[0]?.organization.id;

  useEffect(() => {
    if (!isLoaded || orgId != null || membershipCount !== 1) {
      return;
    }
    if (soleOrganizationId === undefined) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await setActive({ organization: soleOrganizationId });
      } catch {
        if (!cancelled) {
          setActivationError(ACTIVATION_ERROR);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    membershipCount,
    orgId,
    retryNonce,
    setActive,
    soleOrganizationId,
  ]);

  useEffect(() => {
    if (!isLoaded || userMemberships.isLoading) {
      return;
    }
    if (orgId != null) {
      return;
    }
    if (membershipCount === 0) {
      const query =
        redirectUrl === "/"
          ? ""
          : `?redirect_url=${encodeURIComponent(redirectUrl)}`;
      router.replace(`/create-workspace${query}`);
      return;
    }
    if (membershipCount > 1) {
      const query =
        redirectUrl === "/"
          ? ""
          : `?redirect_url=${encodeURIComponent(redirectUrl)}`;
      router.replace(`/select-workspace${query}`);
    }
  }, [
    isLoaded,
    membershipCount,
    orgId,
    redirectUrl,
    router,
    userMemberships.isLoading,
  ]);

  if (activationError != null && orgId == null) {
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

  if (!isLoaded || userMemberships.isLoading || orgId == null) {
    return <LoadingScreen />;
  }

  return children;
}
