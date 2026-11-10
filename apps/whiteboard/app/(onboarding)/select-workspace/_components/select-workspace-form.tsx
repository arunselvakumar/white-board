"use client";

import { useAuth, useWorkspaceList } from "@repo/auth/react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";

const SWITCH_ERROR = "Could not switch to that workspace. Please try again.";

/**
 * Workspace Selection (ADR-0027): one Workspace continues automatically;
 * several must be chosen even when one is already active.
 */
export function SelectWorkspaceForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const { workspaceId } = useAuth();
  const { workspaces, setActive } = useWorkspaceList();
  const destination = postWorkspacePath(redirectUrl);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const attempted = useRef(false);

  const soleWorkspaceId =
    workspaces.length === 1 ? (workspaces[0]?.id ?? null) : null;

  useEffect(() => {
    if (workspaces.length === 0) {
      const query =
        destination === "/"
          ? ""
          : `?redirect_url=${encodeURIComponent(destination)}`;
      router.replace(`/create-workspace${query}`);
      return;
    }
    if (soleWorkspaceId == null) return;
    if (workspaceId === soleWorkspaceId) {
      router.replace(destination);
      return;
    }
    if (attempted.current) return;
    attempted.current = true;
    void setActive(soleWorkspaceId, destination).then(({ error: failure }) => {
      if (failure != null) setError(SWITCH_ERROR);
    });
  }, [
    destination,
    router,
    setActive,
    soleWorkspaceId,
    workspaceId,
    workspaces.length,
  ]);

  const onSelect = async (id: string) => {
    setError(undefined);
    setSelectingId(id);
    const { error: failure } = await setActive(id, destination);
    if (failure != null) {
      setError(SWITCH_ERROR);
      setSelectingId(null);
    }
  };

  if (workspaces.length < 2 && error == null && selectingId == null) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title="Select a workspace"
        description="Choose which workspace to continue with"
      />
      <ul className="space-y-3">
        {workspaces.map((workspace) => {
          const isSelecting = selectingId === workspace.id;
          return (
            <li key={workspace.id}>
              <Button
                type="button"
                variant="outline"
                disabled={selectingId != null}
                onClick={() => {
                  void onSelect(workspace.id);
                }}
                className="border-border hover:border-primary/60 group flex h-auto w-full items-center justify-start gap-3 rounded-xl p-4 text-left font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg text-sm">
                  {workspace.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                  {workspace.name}
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
      <FormAlert message={error} />
    </>
  );
}
