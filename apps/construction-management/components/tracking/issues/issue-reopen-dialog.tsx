"use client";

import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { QueryHttpError } from "@/src/queries/http";
import { useIssueTransition, type Issue } from "@/src/queries/tracking-issues";

/**
 * **Reopen** a solved or closed issue (Reject, CM-0019 §8): a reason is
 * required; Solved / Closed are cleared and the reason stays in the
 * history.
 */
export function IssueReopenDialog({
  issue,
  open,
  onOpenChange,
}: {
  issue: Pick<Issue, "id" | "number">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const transition = useIssueTransition(issue.id);
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reopen ${issue.number}?`}
      description="It goes back to Pending (or Delayed past its Due Date). Say why it is not fixed."
      action="Reopen"
      onSubmit={async (reason) => {
        try {
          await transition.mutateAsync({ action: "reopen", reason });
        } catch (caught) {
          throw new Error(
            caught instanceof QueryHttpError
              ? caught.message
              : "Something went wrong. Please try again.",
            { cause: caught },
          );
        }
      }}
    />
  );
}
