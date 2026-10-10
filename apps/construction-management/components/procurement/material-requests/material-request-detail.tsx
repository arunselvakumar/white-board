"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Download, Pencil, Trash2, Truck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, Suspense, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { LocationLabel } from "@/components/locations/location-picker";
import { DeliveryNotesList } from "@/components/procurement/delivery-notes/delivery-notes-list";
import {
  DocumentActivity,
  DocumentFiles,
} from "@/components/procurement/documents/document-activity";
import {
  centralStoreHref,
  formatDate,
  formatQuantity,
  MaterialRequestStatusBadge,
  projectRequestHref,
} from "@/components/procurement/stores/central-store-parts";
import { StoreConfirmDialog } from "@/components/procurement/stores/store-confirm-dialog";
import { fieldForCode } from "@/lib/server-errors";
import {
  materialRequestPdfUrl,
  materialRequestQuery,
  useCloseMaterialRequest,
  useDeleteMaterialRequest,
  type MaterialRequest,
} from "@/src/queries/material-requests";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

const loading = <p className="text-muted-foreground text-sm">Loading…</p>;

class Quiet extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  );
}

function CloseDialog({
  request,
  open,
  onClose,
}: {
  request: MaterialRequest;
  open: boolean;
  onClose: () => void;
}) {
  const closing = useCloseMaterialRequest();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim() === "") {
              setError("Write why the store will not send the rest.");
              return;
            }
            closing.mutate(
              { id: request.id, updatedAt: request.updatedAt, reason },
              {
                onSuccess: onClose,
                onError: (caught) => {
                  setError(fieldForCode(caught, {}).message);
                },
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Close {request.number}?</DialogTitle>
            <DialogDescription>
              What is still pending will not be sent. What was delivered stays.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="close-reason">Reason</Label>
            <Textarea
              id="close-reason"
              rows={3}
              value={reason}
              aria-invalid={error != null}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            <FieldError message={error ?? undefined} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={closing.isPending}>
              {closing.isPending ? "Closing…" : "Close request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One Material Request (CM-508): its facts, lines with Ask Qty,
 * delivered and pending quantities, its Delivery Notes, comments and
 * files. The Project side edits and deletes it until a Delivery Note
 * exists; the store side creates Delivery Notes and Closes what is left.
 */
export function MaterialRequestDetail({
  requestId,
  side,
}: {
  requestId: string;
  side: "project" | "store";
}) {
  const router = useRouter();
  const { data: request } = useSuspenseQuery(materialRequestQuery(requestId));
  const access = useQuery(procurementAccessQuery(request.projectId)).data;
  const may = (menu: Parameters<typeof canIn>[1], flag: Parameters<typeof canIn>[2]) =>
    access != null && canIn(access, menu, flag);
  const removal = useDeleteMaterialRequest();
  const [dialog, setDialog] = useState<"close" | "delete" | null>(null);

  const open =
    request.status === "requested" || request.status === "partially_delivered";
  const noNotes = request.deliveryNotes.length === 0;
  const canEdit = side === "project" && noNotes && open && may("procurement.material_requests", "update");
  const canDelete = side === "project" && noNotes && may("procurement.material_requests", "delete");
  const canClose = open && may("procurement.material_requests", "approve");
  const canSend =
    open &&
    request.items.some((item) => Number(item.pendingQty) > 0) &&
    may("procurement.delivery_notes", "create");
  const back =
    side === "project"
      ? { label: "Material Requests", href: projectRequestHref.list(request.projectId) }
      : { label: request.storeName ?? "Central Store", href: centralStoreHref.store(request.storeId) };

  return (
    <div className="w-full max-w-5xl space-y-6">
      <PageHeader
        back={back}
        title={request.number}
        leading={<MaterialRequestStatusBadge status={request.status} />}
        meta={`${formatDate(request.requestDate)} · ${request.projectName ?? "Project"} → ${request.storeName ?? "store"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canSend ? (
              <Link
                href={centralStoreHref.newNote(request.id)}
                className={buttonVariants()}
              >
                <Truck aria-hidden="true" />
                Create Delivery Note
              </Link>
            ) : null}
            {canEdit ? (
              <Link
                href={projectRequestHref.edit(request.projectId, request.id)}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            ) : null}
            {may("procurement.material_requests", "print") ? (
              <a
                href={materialRequestPdfUrl(request.id)}
                className={buttonVariants({ variant: "outline" })}
                download
              >
                <Download aria-hidden="true" />
                PDF
              </a>
            ) : null}
            {canClose ? (
              <Button
                variant="outline"
                onClick={() => {
                  setDialog("close");
                }}
              >
                <XCircle aria-hidden="true" />
                Close
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="outline"
                onClick={() => {
                  setDialog("delete");
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-3">
        <Fact label="Request Date">{formatDate(request.requestDate)}</Fact>
        <Fact label="Request To">{request.storeName ?? "—"}</Fact>
        <Fact label="Project">{request.projectName ?? "—"}</Fact>
        <Fact label="Contractor">{request.contractor?.name ?? "—"}</Fact>
        <Fact label="Department">{request.department?.name ?? "—"}</Fact>
        <Fact label="Receiver">{request.receiverName ?? "—"}</Fact>
        {request.siteLocation == null ? null : (
          <Fact label="Site location">
            <Quiet fallback="—">
              <Suspense fallback="…">
                <LocationLabel
                  projectId={request.projectId}
                  value={request.siteLocation as LocationRef}
                />
              </Suspense>
            </Quiet>
          </Fact>
        )}
        {request.remark == null ? null : (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-muted-foreground text-xs">Remark</dt>
            <dd className="text-sm whitespace-pre-wrap">{request.remark}</dd>
          </div>
        )}
        {request.closeReason == null ? null : (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-muted-foreground text-xs">Closed because</dt>
            <dd className="text-sm whitespace-pre-wrap">{request.closeReason}</dd>
          </div>
        )}
      </dl>

      <section className="space-y-3">
        <h2 className="font-semibold">Materials</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table aria-label="Requested materials">
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Ask Qty</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">On the way</TableHead>
                <TableHead className="text-right">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {request.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-40">
                    <span className="block font-medium">{item.materialName}</span>
                    {item.remark == null ? null : (
                      <span className="text-muted-foreground block text-xs">{item.remark}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatQuantity(item.askQty)} {item.uomName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(item.deliveredQty)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(item.inFlightQty)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(item.pendingQty)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Delivery Notes</h2>
        <Suspense fallback={loading}>
          <DeliveryNotesList materialRequestId={request.id} />
        </Suspense>
      </section>

      <DocumentFiles
        documentType="material_request"
        documentId={request.id}
        canEdit={may("procurement.material_requests", "update")}
      />
      <DocumentActivity
        documentType="material_request"
        documentId={request.id}
        heading="Comments"
      />

      <CloseDialog
        request={request}
        open={dialog === "close"}
        onClose={() => {
          setDialog(null);
        }}
      />
      <StoreConfirmDialog
        open={dialog === "delete"}
        title={`Delete ${request.number}?`}
        description="The request is removed for everyone. Its number is not reused."
        action="Delete"
        pendingLabel="Deleting…"
        destructive
        onConfirm={async () => {
          await removal.mutateAsync(request);
          router.push(projectRequestHref.list(request.projectId));
        }}
        onClose={() => {
          setDialog(null);
        }}
      />
    </div>
  );
}
