"use client";

import { useCompanyAuth } from "@repo/auth/construction/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";

import { useCancelCompanyDeletion } from "@/components/account/company-ownership-screen";
import { fieldForCode } from "@/lib/server-errors";
import { accountQueries, formatDay } from "@/src/queries/account";

/**
 * The banner under the shell header while the Company waits to be deleted
 * (CM-907): the date, read-only, and Cancel deletion for the Owner. It
 * never blocks the page: while loading or on error it shows nothing.
 */
export function CompanyDeletionBanner() {
  const { role } = useCompanyAuth();
  const { data } = useQuery({ ...accountQueries.deletion(), retry: false });
  const cancel = useCancelCompanyDeletion();
  const deletion = data?.deletion;
  if (deletion == null) return null;

  return (
    <div
      role="status"
      className="bg-destructive/10 text-foreground flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm print:hidden"
    >
      <span>
        This Company will be deleted on {formatDay(deletion.scheduledFor)}. It
        is read-only until then; reports and exports still work.
      </span>
      {role === "owner" ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          disabled={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          {cancel.isPending ? "Cancelling…" : "Cancel deletion"}
        </Button>
      ) : (
        <span>Ask the Owner if this is a mistake.</span>
      )}
      {cancel.error == null ? null : (
        <span role="alert" className="text-destructive">
          {fieldForCode(cancel.error, {}).message} The Company is still
          scheduled for deletion.
        </span>
      )}
    </div>
  );
}
