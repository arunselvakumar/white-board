"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, PackageCheck, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import {
  DocumentActivity,
  DocumentFiles,
} from "@/components/procurement/documents/document-activity";
import {
  centralStoreHref,
  DeliveryNoteStatusBadge,
  formatDate,
  formatQuantity,
} from "@/components/procurement/stores/central-store-parts";
import { StoreConfirmDialog } from "@/components/procurement/stores/store-confirm-dialog";
import { fieldForCode } from "@/lib/server-errors";
import {
  deliveryNoteQuery,
  useDeliveryNoteCommand,
  type DeliveryNote,
} from "@/src/queries/delivery-notes";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  );
}

function DeliverDialog({
  note,
  open,
  onClose,
}: {
  note: DeliveryNote;
  open: boolean;
  onClose: () => void;
}) {
  const command = useDeliveryNoteCommand();
  const [deliveredOn, setDeliveredOn] = useState(today());
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
            command.mutate(
              { kind: "deliver", id: note.id, updatedAt: note.updatedAt, deliveredOn },
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
            <DialogTitle>Mark {note.number} as delivered?</DialogTitle>
            <DialogDescription>
              The materials are added to {note.projectName ?? "the Project"}&apos;s
              stock as Received from store.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delivered-on">Delivered On</Label>
            <Input
              id="delivered-on"
              type="date"
              className="h-10"
              min={note.deliveryDate}
              max={today()}
              value={deliveredOn}
              aria-invalid={error != null}
              onChange={(event) => {
                setDeliveredOn(event.target.value);
              }}
            />
            <FieldError message={error ?? undefined} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Mark as Delivered"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One Delivery Note (CM-508): pending → Approve (Issued at the store) →
 * Mark as Delivered (Received from store at the Project). A pending note
 * is edited or deleted; there is no reject.
 */
export function DeliveryNoteDetail({ noteId }: { noteId: string }) {
  const router = useRouter();
  const { data: note } = useSuspenseQuery(deliveryNoteQuery(noteId));
  const access = useQuery(procurementAccessQuery(note.projectId)).data;
  const may = (menu: Parameters<typeof canIn>[1], flag: Parameters<typeof canIn>[2]) =>
    access != null && canIn(access, menu, flag);
  const command = useDeliveryNoteCommand();
  const [dialog, setDialog] = useState<"approve" | "deliver" | "delete" | null>(null);
  const pending = note.status === "pending";
  const canDeliver =
    note.status === "in_transit" &&
    (may("procurement.delivery_notes", "update") ||
      may("procurement.material_requests", "update"));

  return (
    <div className="w-full max-w-5xl space-y-6">
      <PageHeader
        back={{ label: note.materialRequestNumber, href: centralStoreHref.request(note.materialRequestId) }}
        title={note.number}
        leading={<DeliveryNoteStatusBadge status={note.status} />}
        meta={`${formatDate(note.deliveryDate)} · ${note.storeName ?? "Store"} → ${note.projectName ?? "Project"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {pending && may("procurement.delivery_notes", "approve") ? (
              <Button
                onClick={() => {
                  setDialog("approve");
                }}
              >
                <CheckCircle2 aria-hidden="true" />
                Approve
              </Button>
            ) : null}
            {canDeliver ? (
              <Button
                onClick={() => {
                  setDialog("deliver");
                }}
              >
                <PackageCheck aria-hidden="true" />
                Mark as Delivered
              </Button>
            ) : null}
            {pending && may("procurement.delivery_notes", "update") ? (
              <Link
                href={centralStoreHref.editNote(note.id)}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            ) : null}
            {pending && may("procurement.delivery_notes", "delete") ? (
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
        <Fact label="Material Request">
          <Link
            href={centralStoreHref.request(note.materialRequestId)}
            className="text-primary underline-offset-4 hover:underline"
          >
            {note.materialRequestNumber}
          </Link>
        </Fact>
        <Fact label="From">{note.storeName ?? "—"}</Fact>
        <Fact label="To">{note.projectName ?? "—"}</Fact>
        <Fact label="Delivery Date">{formatDate(note.deliveryDate)}</Fact>
        <Fact label="Delivered To">{note.deliveredTo ?? "—"}</Fact>
        <Fact label="Delivered On">
          {note.deliveredOn == null ? "—" : formatDate(note.deliveredOn)}
        </Fact>
        {note.remark == null ? null : (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-muted-foreground text-xs">Remark</dt>
            <dd className="text-sm whitespace-pre-wrap">{note.remark}</dd>
          </div>
        )}
      </dl>

      <section className="space-y-3">
        <h2 className="font-semibold">Materials</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table aria-label="Delivered materials">
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {note.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-40 font-medium">{item.materialName}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatQuantity(item.requestedQty)} {item.uomName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(item.pendingQty)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatQuantity(item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <DocumentFiles
        documentType="delivery_note"
        documentId={note.id}
        canEdit={may("procurement.delivery_notes", "update")}
      />
      <DocumentActivity documentType="delivery_note" documentId={note.id} heading="Comments" />

      <StoreConfirmDialog
        open={dialog === "approve"}
        title={`Approve ${note.number}?`}
        description={`The materials leave ${note.storeName ?? "the store"} as Issued and show In transit until the site marks them delivered.`}
        action="Approve"
        pendingLabel="Approving…"
        onConfirm={() => command.mutateAsync({ kind: "approve", id: note.id })}
        onClose={() => {
          setDialog(null);
        }}
      />
      <StoreConfirmDialog
        open={dialog === "delete"}
        title={`Delete ${note.number}?`}
        description="Its quantities go back to pending on the Material Request."
        action="Delete"
        pendingLabel="Deleting…"
        destructive
        onConfirm={async () => {
          await command.mutateAsync({ kind: "delete", id: note.id, updatedAt: note.updatedAt });
          router.push(centralStoreHref.request(note.materialRequestId));
        }}
        onClose={() => {
          setDialog(null);
        }}
      />
      <DeliverDialog
        note={note}
        open={dialog === "deliver"}
        onClose={() => {
          setDialog(null);
        }}
      />
    </div>
  );
}
