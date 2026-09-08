"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";

export function SelectWorkspaceForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const { orgId } = useAuth();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  const destination = postWorkspacePath(redirectUrl);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const membershipCount = userMemberships.count ?? 0;
  const memberships = userMemberships.data ?? [];
  const soleOrganizationId = memberships[0]?.organization.id;

  useEffect(() => {
    if (!isLoaded || userMemberships.isLoading) {
      return;
    }
    if (membershipCount === 0) {
      const query =
        destination === "/"
          ? ""
          : `?redirect_url=${encodeURIComponent(destination)}`;
      router.replace(`/create-workspace${query}`);
      return;
    }
    if (orgId != null) {
      router.replace(destination);
    }
  }, [
    destination,
    isLoaded,
    membershipCount,
    orgId,
    router,
    userMemberships.isLoading,
  ]);

  useEffect(() => {
    if (!isLoaded || orgId != null || membershipCount !== 1) {
      return;
    }
    if (soleOrganizationId === undefined) {
      return;
    }
    void setActive({ organization: soleOrganizationId }).then(() => {
      router.replace(destination);
    });
  }, [
    destination,
    isLoaded,
    membershipCount,
    orgId,
    router,
    setActive,
    soleOrganizationId,
  ]);

  const onSelect = async (organizationId: string) => {
    if (!isLoaded) {
      return;
    }
    setError(undefined);
    setSelectingId(organizationId);
    try {
      await setActive({ organization: organizationId });
      router.replace(destination);
    } catch {
      setError("Could not switch to that workspace. Please try again.");
      setSelectingId(null);
    }
  };

  if (
    !isLoaded ||
    userMemberships.isLoading ||
    orgId != null ||
    membershipCount < 2
  ) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title="Select a workspace"
        description="Choose which workspace to continue with"
      />
      <ul className="space-y-3">
        {memberships.map((membership) => {
          const { organization } = membership;
          const isSelecting = selectingId === organization.id;
          return (
            <li key={organization.id}>
              <button
                type="button"
                disabled={selectingId != null}
                onClick={() => {
                  void onSelect(organization.id);
                }}
                className="border-border hover:border-primary/60 group flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg text-sm">
                  {organization.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                  {organization.name}
                </span>
                {isSelecting ? (
                  <span className="border-primary h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent" />
                ) : (
                  <ChevronRight
                    size={18}
                    className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <FormAlert message={error} />
    </>
  );
}
