"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { orgId } = useAuth();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });

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
    void setActive({ organization: soleOrganizationId });
  }, [isLoaded, membershipCount, orgId, setActive, soleOrganizationId]);

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

  if (!isLoaded || userMemberships.isLoading || orgId == null) {
    return <LoadingScreen />;
  }

  return children;
}
