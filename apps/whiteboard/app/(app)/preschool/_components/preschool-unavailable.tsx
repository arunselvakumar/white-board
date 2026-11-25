"use client";

import {
  HourglassIcon,
  ProhibitIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import { useAuth, useUser, useWorkspace } from "@repo/auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PageFallback } from "@/components/query-suspense";
import { isPreschool } from "@/lib/institution-type";
import { QueryHttpError } from "@/src/queries/http";
import { isNotAPreschool, preschoolKeys } from "@/src/queries/preschool/me";
import { setUpPreschool } from "@/src/queries/preschool/setup";

/**
 * Workspace Creation made the Workspace but its Preschool setup did not
 * finish: the Owner's first visit runs it again (it is safe to repeat).
 */
function FinishSetup() {
  const queryClient = useQueryClient();
  const setUp = useMutation({
    mutationFn: setUpPreschool,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: preschoolKeys.all }),
  });
  const started = useRef(false);
  const { mutate } = setUp;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  if (setUp.isError)
    return (
      <EmptyState
        className="m-6 border"
        icon={WarningCircleIcon}
        tone="danger"
        orbit={false}
        title="Couldn't finish setting up your Preschool"
        description="Your Workspace is safe. Please try again."
        actions={
          <Button
            type="button"
            onClick={() => {
              setUp.mutate();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  return (
    <div role="status" aria-label="Finishing setting up your Preschool">
      <PageFallback />
    </div>
  );
}

/** What a Preschool screen shows when `/api/preschool/me` did not answer. */
export function PreschoolUnavailable({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { role } = useAuth();
  const { user } = useUser();
  const { workspace } = useWorkspace();

  if (isNotAPreschool(error)) {
    if (role === "owner" && isPreschool(workspace?.institutionType))
      return <FinishSetup />;
    return (
      <EmptyState
        className="m-6 border"
        icon={HourglassIcon}
        tone="neutral"
        orbit={false}
        title="This Preschool is not set up yet"
        description="It finishes setting up the next time the Workspace Owner opens Whiteboard."
      />
    );
  }
  if (
    error instanceof QueryHttpError &&
    error.status === 403 &&
    role === "parent"
  )
    return (
      <EmptyState
        className="m-6 border"
        icon={ProhibitIcon}
        tone="neutral"
        orbit={false}
        title="We couldn't find your Child"
        description={`We couldn't find a Child linked to ${user?.email ?? "your email"}. Ask the Centre to check the email on your Child's record.`}
      />
    );
  if (error instanceof QueryHttpError && error.status === 403)
    return (
      <EmptyState
        className="m-6 border"
        icon={ProhibitIcon}
        tone="neutral"
        orbit={false}
        title="Nothing to show yet"
        description="Your verified email is not on a Staff record or a Child's record here. Ask the Centre to add it."
      />
    );
  return (
    <EmptyState
      className="m-6 border"
      icon={WarningCircleIcon}
      tone="danger"
      orbit={false}
      title="Couldn't load this Preschool"
      description="Please try again."
      actions={
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
