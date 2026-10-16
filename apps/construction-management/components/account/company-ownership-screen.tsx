"use client";

import {
  useActiveCompany,
  useCompanyAuth,
} from "@repo/auth/construction/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Lock, Trash2, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  accountQueries,
  cancelCompanyDeletion,
  formatDay,
} from "@/src/queries/account";

import { DeleteCompanyDialog } from "./delete-company-dialog";
import { TransferOwnershipDialog } from "./transfer-ownership-dialog";

/** Cancel deletion, for the Owner (also in the shell banner). */
export function useCancelCompanyDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelCompanyDeletion,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountQueries.key.deletion }),
  });
}

function OwnerActions({ companyName }: { companyName: string }) {
  const { data } = useSuspenseQuery(accountQueries.deletion());
  const [open, setOpen] = useState<"transfer" | "delete" | null>(null);
  const cancel = useCancelCompanyDeletion();
  const pending = data.deletion;

  return (
    <>
      <ItemGroup className="gap-3">
        <Item
          id="transfer-ownership"
          variant="outline"
          role="listitem"
          className="flex-wrap"
        >
          <ItemMedia variant="icon">
            <UserRoundCog />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>Transfer ownership</ItemTitle>
            <ItemDescription>
              Hand {companyName} to another Team Member. You stay as an Admin.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              type="button"
              variant="outline"
              disabled={pending != null}
              onClick={() => {
                setOpen("transfer");
              }}
            >
              Transfer…
            </Button>
          </ItemActions>
        </Item>
        <Item
          id="delete-company"
          variant="outline"
          role="listitem"
          className="flex-wrap"
        >
          <ItemMedia variant="icon">
            <Trash2 />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>Delete Company</ItemTitle>
            <ItemDescription>
              {pending == null
                ? "Read-only for 30 days, then deleted for good. You can cancel until then."
                : `Scheduled: ${companyName} will be deleted on ${formatDay(pending.scheduledFor)}. It is read-only until then.`}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {pending == null ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setOpen("delete");
                }}
              >
                Delete…
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => {
                  cancel.mutate();
                }}
              >
                {cancel.isPending ? "Cancelling…" : "Cancel deletion"}
              </Button>
            )}
          </ItemActions>
        </Item>
      </ItemGroup>
      <FormAlert
        message={
          cancel.error == null
            ? undefined
            : fieldForCode(cancel.error, {}).message
        }
      />
      {open === "transfer" && (
        <TransferOwnershipDialog
          companyName={companyName}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
      {open === "delete" && (
        <DeleteCompanyDialog
          companyName={companyName}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Masters → Settings → Company (CM-907): Transfer ownership and Delete
 * Company, the Owner's alone.
 */
export function CompanyOwnershipScreen() {
  const { role } = useCompanyAuth();
  const { company } = useActiveCompany();
  const companyName = company?.name ?? "this Company";

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader
          back={{ label: "Settings", href: "/app/masters/settings" }}
          title="Company"
          meta="Who owns the Company, and deleting it."
        />
        {role === "owner" ? (
          <OwnerActions companyName={companyName} />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Lock />
              </EmptyMedia>
              <EmptyTitle>Only the Owner can do this</EmptyTitle>
              <EmptyDescription>
                Transferring ownership and deleting {companyName} are the
                Owner&apos;s alone.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
