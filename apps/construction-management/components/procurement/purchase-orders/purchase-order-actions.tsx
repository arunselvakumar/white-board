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
  purchaseOrderPdfUrl,
  usePurchaseOrderCommand,
  type PurchaseOrder,
} from "@/src/queries/purchase-orders";

import { purchaseOrdersPath } from "./purchase-order-format";

type Item = {
  key: string;
  label: string;
  run: () => void;
  primary?: boolean;
  destructive?: boolean;
};

/**
 * What can be done with one Purchase Order (CM-504), from its `actions`:
 * View, Approve, Reject, Mark as Ordered, Close, Edit, PDF, Delete.
 */
export function PurchaseOrderActions({
  po,
  projectId,
  variant,
  onError,
  onDeleted,
}: {
  po: PurchaseOrder;
  projectId: string;
  variant: "menu" | "buttons";
  onError: (message: string | undefined) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const command = usePurchaseOrderCommand();
  const [rejecting, setRejecting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { actions } = po;
  const run = (input: Parameters<typeof command.mutate>[0]) => {
    onError(undefined);
    command.mutate(input, {
      onError: (failure) => {
        onError(fieldForCode(failure, {}).message);
      },
    });
  };
  const reason =
    (kind: "reject" | "close") =>
    async (text: string): Promise<void> => {
      try {
        await command.mutateAsync({
          kind,
          id: po.id,
          reason: text,
          expectedUpdatedAt: po.updatedAt,
        });
      } catch (failure) {
        throw new Error(fieldForCode(failure, {}).message, { cause: failure });
      }
    };

  const items: Item[] = [];
  if (variant === "menu")
    items.push({
      key: "view",
      label: "View",
      run: () => {
        router.push(purchaseOrdersPath(projectId, `/${po.id}`));
      },
    });
  if (actions.approve)
    items.push({
      key: "approve",
      label: "Approve",
      primary: true,
      run: () => {
        run({ kind: "approve", id: po.id, expectedUpdatedAt: po.updatedAt });
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
  if (actions.markOrdered)
    items.push({
      key: "mark-ordered",
      label: "Mark as Ordered",
      primary: true,
      run: () => {
        run({
          kind: "mark-ordered",
          id: po.id,
          expectedUpdatedAt: po.updatedAt,
        });
      },
    });
  if (actions.close)
    items.push({
      key: "close",
      label: "Close",
      run: () => {
        setClosing(true);
      },
    });
  if (actions.edit)
    items.push({
      key: "edit",
      label: "Edit",
      run: () => {
        router.push(purchaseOrdersPath(projectId, `/${po.id}/edit`));
      },
    });
  if (actions.print)
    items.push({
      key: "pdf",
      label: "Download PDF",
      run: () => {
        window.open(purchaseOrderPdfUrl(po.id), "_blank", "noopener");
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
        title={`Reject ${po.number}?`}
        description="It stops counting towards its Purchase Request; it can be edited and resubmitted."
        action="Reject"
        onSubmit={reason("reject")}
      />
      <ReasonDialog
        open={closing}
        onOpenChange={setClosing}
        title={`Close ${po.number}?`}
        description="A closed Purchase Order expects no more deliveries. Raise a new one for the rest."
        action="Close Purchase Order"
        onSubmit={reason("close")}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {po.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The Purchase Order is removed and its Purchase Request no longer
              counts it. A PO with goods received cannot be deleted.
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
                    id: po.id,
                    expectedUpdatedAt: po.updatedAt,
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
        {items.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={item.primary === true ? "default" : "outline"}
            className={
              item.destructive === true ? "text-destructive" : undefined
            }
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
              aria-label={`Actions for ${po.number}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {item.destructive === true && index > 0 && (
                <DropdownMenuSeparator />
              )}
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
