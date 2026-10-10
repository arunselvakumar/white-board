"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MapPinned, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader } from "@/components/app-shell/page-header";
import { QueryHttpError } from "@/src/queries/http";
import {
  billingAddressesQuery,
  deleteBillingAddress,
  makeDefaultBillingAddress,
  type BillingAddressItem,
} from "@/src/queries/billing-addresses";

import { BillingAddressDialog } from "./billing-address-dialog";

function messageOf(cause: unknown): string {
  return cause instanceof QueryHttpError
    ? cause.message
    : "Something went wrong. Please try again.";
}

/** Settings → Billing addresses (CM-501): the addresses Purchase Orders bill from. */
export function BillingAddressesManager() {
  const { data } = useSuspenseQuery(billingAddressesQuery);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BillingAddressItem | "new" | null>(
    null,
  );
  const [deleting, setDeleting] = useState<BillingAddressItem | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: billingAddressesQuery.queryKey });
  const remove = useMutation({ mutationFn: deleteBillingAddress });
  const promote = useMutation({ mutationFn: makeDefaultBillingAddress });
  const others = data.items.length - 1;

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setError(undefined);
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add billing address
    </Button>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Settings", href: "/app/masters/settings" }}
          title="Billing addresses"
          meta="The addresses and GSTINs your Purchase Orders bill from. New orders start with the default."
          actions={data.items.length > 0 ? addButton : undefined}
        />

        <FormAlert message={error} />

        {data.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinned />
              </EmptyMedia>
              <EmptyTitle>No billing addresses yet</EmptyTitle>
              <EmptyDescription>
                Add the address and GSTIN you bill from. The first one you add
                becomes the default on Purchase Orders.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          <ul
            aria-label="Billing addresses"
            className="divide-y rounded-xl border"
          >
            {data.items.map((item) => (
              <li
                key={item.id}
                aria-label={item.name}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="break-words">{item.name}</span>
                    {item.isDefault && <Badge>Default</Badge>}
                  </p>
                  <p className="text-sm break-words whitespace-pre-line">
                    {item.address}
                  </p>
                  <p className="text-muted-foreground text-sm break-words">
                    {item.stateName} ({item.stateCode})
                    {item.gstin == null ? (
                      " · No GSTIN"
                    ) : (
                      <>
                        {" · GSTIN "}
                        <span className="font-mono">{item.gstin}</span>
                      </>
                    )}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${item.name}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      onClick={() => {
                        setError(undefined);
                        setEditing(item);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    {!item.isDefault && (
                      <DropdownMenuItem
                        onClick={() => {
                          setError(undefined);
                          promote.mutate(item.id, {
                            onSuccess: () => void refresh(),
                            onError: (cause) => {
                              setError(messageOf(cause));
                              void refresh();
                            },
                          });
                        }}
                      >
                        Make default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setError(undefined);
                        setDeleting(item);
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}

        {editing != null && (
          <BillingAddressDialog
            address={editing === "new" ? null : editing}
            onClose={() => {
              setEditing(null);
            }}
            onSaved={() => {
              setEditing(null);
              void refresh();
            }}
          />
        )}

        <AlertDialog
          open={deleting != null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Purchase Orders already saved keep this address.
                {deleting?.isDefault === true && others > 0
                  ? " The oldest remaining address becomes the default."
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = deleting;
                  setDeleting(null);
                  if (target == null) return;
                  remove.mutate(target.id, {
                    onSuccess: () => void refresh(),
                    onError: (cause) => {
                      setError(messageOf(cause));
                      void refresh();
                    },
                  });
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
