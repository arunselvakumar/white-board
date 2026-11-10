"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import {
  useTransactionCommand,
  type RegisterItem,
} from "@/src/queries/finance-transactions";

import { itemPath } from "./transaction-format";

/**
 * What can be done with one Transaction or transfer (CM-702), from its
 * `actions`: View, Approve, Reject, Edit and Delete — a menu on list rows,
 * buttons on the detail page.
 */
export function TransactionActions({
  projectId,
  item,
  variant,
  onError,
  onEdit,
  onDeleted,
}: {
  projectId: string;
  item: RegisterItem;
  variant: "menu" | "buttons";
  onError: (message: string | undefined) => void;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const command = useTransactionCommand();
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { actions } = item;
  const noun = item.type === "transaction" ? "Transaction" : "Transfer";

  const items: {
    key: string;
    label: string;
    run: () => void;
    primary?: boolean;
    destructive?: boolean;
  }[] = [];
  if (variant === "menu")
    items.push({
      key: "view",
      label: "View",
      run: () => {
        router.push(itemPath(projectId, item));
      },
    });
  if (actions.approve)
    items.push({
      key: "approve",
      label: "Approve",
      primary: true,
      run: () => {
        onError(undefined);
        command.mutate(
          {
            kind: "approve",
            document: item.type,
            id: item.id,
            expectedUpdatedAt: item.updatedAt,
          },
          {
            onError: (failure) => {
              onError(fieldForCode(failure, {}).message);
            },
          },
        );
      },
    });
  if (actions.reject)
    items.push({
      key: "reject",
      label: "Reject",
      run: () => {
        setRejecting(true);
      },
    });
  if (actions.edit) items.push({ key: "edit", label: "Edit", run: onEdit });
  if (actions.delete)
    items.push({
      key: "delete",
      label: "Delete",
      destructive: true,
      run: () => {
        setDeleting(true);
      },
    });

  const dialogs = (
    <>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${item.number}?`}
        description="The person who recorded it sees the reason and can edit it, which sends it back for approval."
        action="Reject"
        onSubmit={async (reason) => {
          try {
            await command.mutateAsync({
              kind: "reject",
              document: item.type,
              id: item.id,
              reason,
              expectedUpdatedAt: item.updatedAt,
            });
          } catch (failure) {
            throw new Error(fieldForCode(failure, {}).message, {
              cause: failure,
            });
          }
        }}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {item.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.approvalStatus === "approved"
                ? `This ${noun} is approved: deleting it takes its money back out of the account balance. Its number is not used again.`
                : `The ${noun} is removed. Its number is not used again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                onError(undefined);
                command.mutate(
                  {
                    kind: "delete",
                    document: item.type,
                    id: item.id,
                    expectedUpdatedAt: item.updatedAt,
                  },
                  {
                    onSuccess: () => {
                      setDeleting(false);
                      onDeleted?.();
                    },
                    onError: (failure) => {
                      setDeleting(false);
                      onError(fieldForCode(failure, {}).message);
                    },
                  },
                );
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (variant === "buttons")
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((entry) => (
          <Button
            key={entry.key}
            type="button"
            size="sm"
            variant={entry.primary === true ? "default" : "outline"}
            className={
              entry.destructive === true ? "text-destructive" : undefined
            }
            disabled={command.isPending}
            onClick={entry.run}
          >
            {entry.label}
          </Button>
        ))}
        {dialogs}
      </div>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${item.number}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((entry, index) => (
            <Fragment key={entry.key}>
              {entry.destructive === true && index > 0 && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItem
                variant={entry.destructive === true ? "destructive" : "default"}
                onClick={entry.run}
              >
                {entry.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
