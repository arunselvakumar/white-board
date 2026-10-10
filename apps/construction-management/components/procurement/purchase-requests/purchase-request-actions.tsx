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

import { fieldForCode } from "@/lib/server-errors";
import {
  purchaseRequestPdfUrl,
  usePurchaseRequestCommand,
  type PurchaseRequest,
} from "@/src/queries/purchase-requests";

import { ReasonDialog } from "./reason-dialog";

export function purchaseRequestsPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/materials/purchase-requests${rest}`;
}

export function generatePurchaseOrderPath(projectId: string, prId: string) {
  return `/app/projects/${encodeURIComponent(projectId)}/materials/purchase-orders/new?purchaseRequestId=${encodeURIComponent(prId)}`;
}

/**
 * What can be done with one Purchase Request (CM-503), from its
 * `actions`: View, Edit, Approve, Reject, Mark as Ordered, Generate PO,
 * PDF and Delete — a menu on list rows, buttons on the detail page.
 */
export function PurchaseRequestActions({
  pr,
  variant,
  onError,
  onDeleted,
}: {
  pr: PurchaseRequest;
  variant: "menu" | "buttons";
  onError: (message: string | undefined) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const command = usePurchaseRequestCommand();
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { actions } = pr;

  const run = (input: Parameters<typeof command.mutate>[0]) => {
    onError(undefined);
    command.mutate(input, {
      onError: (failure) => {
        onError(fieldForCode(failure, {}).message);
      },
    });
  };

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
        router.push(purchaseRequestsPath(pr.projectId, `/${pr.id}`));
      },
    });
  if (actions.approve)
    items.push({
      key: "approve",
      label: "Approve",
      primary: true,
      run: () => {
        run({ kind: "approve", id: pr.id, expectedUpdatedAt: pr.updatedAt });
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
  if (actions.generateOrder)
    items.push({
      key: "generate",
      label: "Generate PO",
      primary: !actions.approve,
      run: () => {
        router.push(generatePurchaseOrderPath(pr.projectId, pr.id));
      },
    });
  if (actions.markOrdered)
    items.push({
      key: "mark-ordered",
      label: "Mark as Ordered",
      run: () => {
        run({ kind: "mark-ordered", id: pr.id, expectedUpdatedAt: pr.updatedAt });
      },
    });
  if (actions.edit)
    items.push({
      key: "edit",
      label: "Edit",
      run: () => {
        router.push(purchaseRequestsPath(pr.projectId, `/${pr.id}/edit`));
      },
    });
  if (actions.print)
    items.push({
      key: "pdf",
      label: "Download PDF",
      run: () => {
        window.open(purchaseRequestPdfUrl(pr.id), "_blank", "noopener");
      },
    });
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
        title={`Reject ${pr.number}?`}
        description="The requester sees the reason and can edit and resubmit it."
        action="Reject"
        onSubmit={async (reason) => {
          try {
            await command.mutateAsync({
              kind: "reject",
              id: pr.id,
              reason,
              expectedUpdatedAt: pr.updatedAt,
            });
          } catch (failure) {
            throw new Error(fieldForCode(failure, {}).message);
          }
        }}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pr.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The Purchase Request is removed; its number is not used again. A
              request with Purchase Orders raised against it cannot be deleted.
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
                  { kind: "delete", id: pr.id, expectedUpdatedAt: pr.updatedAt },
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
        {items.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={
              item.destructive === true
                ? "outline"
                : item.primary === true
                  ? "default"
                  : "outline"
            }
            className={item.destructive === true ? "text-destructive" : undefined}
            disabled={command.isPending}
            onClick={item.run}
          >
            {item.label}
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
              aria-label={`Actions for ${pr.number}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {item.destructive === true && index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant={item.destructive === true ? "destructive" : "default"}
                onClick={item.run}
              >
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
