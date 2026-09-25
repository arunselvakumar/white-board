"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";

export function SelectWorkspaceForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const { orgId } = useAuth();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
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
    if (membershipCount === 1 && orgId === soleOrganizationId) {
      router.replace(destination);
    }
  }, [
    destination,
    isLoaded,
    membershipCount,
    orgId,
    router,
    soleOrganizationId,
    userMemberships.isLoading,
  ]);

  useEffect(() => {
    if (!isLoaded || membershipCount !== 1 || orgId === soleOrganizationId) {
      return;
    }
    if (soleOrganizationId === undefined) {
      return;
    }
    const cancelled = { current: false };
    void (async () => {
      try {
        await setActive({ organization: soleOrganizationId });
        if (!cancelled.current) {
          router.replace(destination);
        }
      } catch {
        if (!cancelled.current) {
          setError("Could not switch to that workspace. Please try again.");
        }
      }
    })();
    return () => {
      cancelled.current = true;
    };
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
      router.refresh();
    } catch {
      setError("Could not switch to that workspace. Please try again.");
      setSelectingId(null);
    }
  };

  if (
    !isLoaded ||
    userMemberships.isLoading ||
    (membershipCount < 2 && error == null && selectingId == null)
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
              <Button
                type="button"
                variant="outline"
                disabled={selectingId != null}
                onClick={() => {
                  void onSelect(organization.id);
                }}
                className="border-border hover:border-primary/60 group flex h-auto w-full items-center justify-start gap-3 rounded-xl p-4 text-left font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
              </Button>
            </li>
          );
        })}
      </ul>
      {userMemberships.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={userMemberships.isFetching}
          onClick={() => {
            userMemberships.fetchNext();
          }}
        >
          {userMemberships.isFetching ? "Loading…" : "Show more Workspaces"}
        </Button>
      )}
      <FormAlert message={error} />
    </>
  );
}
