"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, PackageCheck, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import {
  DocumentActivity,
  DocumentFiles,
} from "@/components/procurement/documents/document-activity";
import {
  formatDate,
  formatQuantity,
  localToday,
} from "@/components/procurement/inventory/inventory-format";
import { StockErrorAlert } from "@/components/procurement/inventory/stock-error-alert";
import { TRANSFER_TYPE_LABELS } from "@/src/procurement/domain/material-transfer";
import { QueryHttpError } from "@/src/queries/http";
import {
  transferQuery,
  useDeleteTransfer,
  useTransferAction,
  type MaterialTransfer,
} from "@/src/queries/material-transfers";

import { TransferStatusBadge, useTransferSideCan } from "./transfer-parts";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function person(value: MaterialTransfer["createdBy"] | null): string {
  if (value == null) return "—";
  return value.name ?? "A former member";
}

function RejectDialog({
  transfer,
  open,
  onClose,
}: {
  transfer: MaterialTransfer;
  open: boolean;
  onClose: () => void;
}) {
  const action = useTransferAction(transfer.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {transfer.number}?</DialogTitle>
          <DialogDescription>
            Nothing moves. The sender sees your reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={reason}
            aria-invalid={error != null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <FieldError message={error} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={action.isPending}
            onClick={() => {
              if (reason.trim() === "") {
                setError("Write the reason.");
                return;
              }
              action.mutate(
                { action: "reject", reason: reason.trim() },
                {
                  onSuccess: onClose,
                  onError: (caught) => {
                    setError(
                      caught instanceof QueryHttpError
                        ? caught.message
                        : "Something went wrong. Please try again.",
                    );
                  },
                },
              );
            }}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({
  transfer,
  open,
  onClose,
}: {
  transfer: MaterialTransfer;
  open: boolean;
  onClose: () => void;
}) {
  const action = useTransferAction(transfer.id);
  const [deliveredOn, setDeliveredOn] = useState(localToday());
  const [error, setError] = useState<string | undefined>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Delivered</DialogTitle>
          <DialogDescription>
            The material is added to {transfer.to.name}&apos;s stock on the
            delivery date, and you are recorded as receiving it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="delivered-on">Delivered on</Label>
          <Input
            id="delivered-on"
            type="date"
            min={transfer.transferDate}
            max={localToday()}
            value={deliveredOn}
            aria-invalid={error != null}
            onChange={(event) => {
              setDeliveredOn(event.target.value);
            }}
          />
          <FieldError message={error} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={action.isPending}
            onClick={() => {
              if (deliveredOn === "") {
                setError("Choose the delivery date.");
                return;
              }
              if (deliveredOn < transfer.transferDate) {
                setError("The delivery date cannot be before the transfer date.");
                return;
              }
              action.mutate(
                { action: "deliver", deliveredOn },
                {
                  onSuccess: onClose,
                  onError: (caught) => {
                    setError(
                      caught instanceof QueryHttpError
                        ? caught.message
                        : "Something went wrong. Please try again.",
                    );
                  },
                },
              );
            }}
          >
            Mark as Delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One Material Transfer (CM-507): its status, route, lines and who did
 * what; Approve (dispatch), Reject and Edit / Delete while pending, Mark
 * as Delivered while in transit — each shown only to members who may;
 * then its comments and files.
 */
export function TransferDetail({
  id,
  backHref,
  editHref,
  afterDeleteHref,
}: {
  id: string;
  backHref: string;
  editHref: string;
  afterDeleteHref: string;
}) {
  const router = useRouter();
  const { data: transfer } = useSuspenseQuery(transferQuery(id));
  const atSource = useTransferSideCan(transfer.from);
  const atDestination = useTransferSideCan(transfer.to);
  const action = useTransferAction(transfer.id);
  const remove = useDeleteTransfer(transfer.id);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<"reject" | "deliver" | "delete" | null>(null);

  const pending = transfer.status === "pending";
  const canApprove = pending && atSource("approve");
  const canReject = pending && atSource("reject");
  const canEdit = pending && atSource("update");
  const canDelete = pending && atSource("delete");
  const canDeliver = transfer.status === "in_transit" && atDestination("update");
  const canAttach = atSource("update") || atDestination("update");

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Material Transfers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              {transfer.number}
              <TransferStatusBadge status={transfer.status} />
            </h2>
            <p className="text-muted-foreground text-sm">
              {TRANSFER_TYPE_LABELS[transfer.type]} · {formatDate(transfer.transferDate)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <Button
                type="button"
                size="sm"
                disabled={action.isPending}
                onClick={() => {
                  setError(null);
                  action.mutate(
                    { action: "approve", expectedUpdatedAt: transfer.updatedAt },
                    { onError: setError },
                  );
                }}
              >
                <Check aria-hidden="true" />
                Approve
              </Button>
            )}
            {canReject && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("reject");
                }}
              >
                <X aria-hidden="true" />
                Reject
              </Button>
            )}
            {canDeliver && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDialog("deliver");
                }}
              >
                <PackageCheck aria-hidden="true" />
                Mark as Delivered
              </Button>
            )}
            {canEdit && (
              <Link
                href={editHref}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  setDialog("delete");
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <StockErrorAlert error={error} />

      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Fact label="From">{transfer.from.name}</Fact>
        <Fact label="To">{transfer.to.name}</Fact>
        <Fact label="Receiver Name">{transfer.receiverName ?? "—"}</Fact>
        <Fact label="Sent by">{person(transfer.createdBy)}</Fact>
        {transfer.decidedAt != null && (
          <Fact label={transfer.approvalStatus === "rejected" ? "Rejected by" : "Approved by"}>
            {person(transfer.decidedBy)}
          </Fact>
        )}
        {transfer.deliveredOn != null && (
          <Fact label="Delivered">
            {formatDate(transfer.deliveredOn)} · Received by{" "}
            {person(transfer.deliveredBy)}
          </Fact>
        )}
        {transfer.rejectionReason != null && (
          <Fact label="Reason">{transfer.rejectionReason}</Fact>
        )}
        {transfer.remark != null && <Fact label="Remark">{transfer.remark}</Fact>}
      </dl>

      <section aria-labelledby="transfer-materials" className="space-y-2">
        <h3 id="transfer-materials" className="text-sm font-semibold">
          Materials
        </h3>
        <ul aria-label="Materials" className="divide-y rounded-lg border">
          {transfer.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{line.materialName}</p>
                {line.remark != null && (
                  <p className="text-muted-foreground text-xs">{line.remark}</p>
                )}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {formatQuantity(line.quantity)} {line.uomName}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <DocumentFiles
        documentType="material_transfer"
        documentId={transfer.id}
        canEdit={canAttach}
      />
      <DocumentActivity
        documentType="material_transfer"
        documentId={transfer.id}
        heading="Comments"
      />

      <RejectDialog
        transfer={transfer}
        open={dialog === "reject"}
        onClose={() => {
          setDialog(null);
        }}
      />
      <DeliverDialog
        transfer={transfer}
        open={dialog === "deliver"}
        onClose={() => {
          setDialog(null);
        }}
      />
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {transfer.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              It was never approved, so no stock moved. The number is not
              used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(transfer.updatedAt, {
                  onSuccess: () => {
                    router.push(afterDeleteHref);
                  },
                  onError: (caught) => {
                    setDialog(null);
                    setError(caught);
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
