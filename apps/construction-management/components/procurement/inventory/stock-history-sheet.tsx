"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { History, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import {
  AlertDialog,
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
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

import { LocationLabel } from "@/components/locations/location-picker";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import {
  inventoryHistoryQuery,
  useDeleteMovement,
  type InventoryRow,
  type StockEntry,
} from "@/src/queries/inventory";

import { EditMovementDialog, type EditableEntry } from "./edit-movement-dialog";
import { formatDate, formatQuantity, formatSigned } from "./inventory-format";
import { StockErrorAlert } from "./stock-error-alert";

function Source({ entry }: { entry: StockEntry }) {
  const { source } = entry;
  if (source.number == null) return null;
  return source.href == null ? (
    <span>{source.number}</span>
  ) : (
    <Link
      href={source.href}
      className="text-primary underline underline-offset-2"
    >
      {source.number}
    </Link>
  );
}

function EntryItem({
  location,
  entry,
  uomName,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  location: StockLocation;
  entry: StockEntry;
  uomName: string;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (entry: EditableEntry) => void;
  onDelete: (entry: EditableEntry) => void;
}) {
  const reversal = entry.reversesEntryId != null;
  const movement = entry.movement;
  const editable = movement != null && movement.editable && canUpdate;
  const deletable = movement != null && canDelete;
  const negative = Number(entry.quantity) < 0;
  return (
    <li
      className={cn(
        "space-y-1 rounded-lg border px-3 py-2.5",
        (reversal || entry.reversed) && "bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {entry.typeLabel}
            {reversal && (
              <Badge variant="outline">
                <Undo2 aria-hidden="true" />
                Reversal
              </Badge>
            )}
            {entry.reversed && <Badge variant="outline">Reversed</Badge>}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDate(entry.entryDate)}
            {entry.counterpartyLabel != null && ` · ${entry.counterpartyLabel}`}
            {entry.source.number != null && " · "}
            <Source entry={entry} />
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="text-right">
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                negative
                  ? "text-destructive"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {formatSigned(entry.quantity)} {uomName}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              Balance {formatQuantity(entry.balance)}
            </p>
          </div>
          {(editable || deletable) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 size-8"
                    aria-label={`Actions for ${entry.typeLabel} on ${formatDate(entry.entryDate)}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {editable && (
                  <DropdownMenuItem
                    onClick={() => {
                      onEdit({ ...entry, movement });
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </DropdownMenuItem>
                )}
                {deletable && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      onDelete({ ...entry, movement });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {entry.siteLocation != null && location.kind === "project" && (
        <Suspense fallback={null}>
          <LocationLabel
            projectId={location.id}
            value={entry.siteLocation}
            className="text-muted-foreground block text-xs"
          />
        </Suspense>
      )}
      {entry.remark != null && <p className="text-sm">{entry.remark}</p>}
      <p className="text-muted-foreground text-xs">
        By {entry.createdBy.name ?? "a former member"}
      </p>
    </li>
  );
}

function Entries({
  location,
  row,
  canUpdate,
  canDelete,
}: {
  location: StockLocation;
  row: InventoryRow;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const { data } = useSuspenseQuery(
    inventoryHistoryQuery(location, row.materialId, cursor),
  );
  const remove = useDeleteMovement();
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [deleting, setDeleting] = useState<EditableEntry | null>(null);
  const [error, setError] = useState<unknown>(null);
  const current = data.material ?? row;

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No stock movements yet</EmptyTitle>
          <EmptyDescription>
            Receipts, transfers, consumption and adjustments of this material
            here show in this list.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        In stock{" "}
        <span className="font-semibold tabular-nums">
          {formatQuantity(current.inStock)} {current.uomName}
        </span>{" "}
        · {data.total} {data.total === 1 ? "entry" : "entries"}
      </p>
      <StockErrorAlert error={error} />
      <ol aria-label="Stock entries" className="space-y-2">
        {data.items.map((entry) => (
          <EntryItem
            key={entry.id}
            location={location}
            entry={entry}
            uomName={current.uomName}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={setEditing}
            onDelete={(target) => {
              setError(null);
              setDeleting(target);
            }}
          />
        ))}
      </ol>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null)
                setCursor({ before: data.prevCursor });
            }}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null)
                setCursor({ after: data.nextCursor });
            }}
          >
            Older
          </Button>
        </div>
      )}
      <EditMovementDialog
        location={location}
        entry={editing}
        uomName={current.uomName}
        onClose={() => {
          setEditing(null);
        }}
      />
      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this {deleting?.typeLabel.toLowerCase()} entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A reversal is posted and the stock goes back by{" "}
              {deleting == null
                ? ""
                : formatQuantity(
                    String(Math.abs(Number(deleting.quantity))),
                  )}{" "}
              {current.uomName}. Both stay in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting == null) return;
                remove.mutate(
                  {
                    id: deleting.movement.id,
                    expectedUpdatedAt: deleting.movement.updatedAt,
                  },
                  {
                    onSettled: () => {
                      setDeleting(null);
                    },
                    onError: setError,
                  },
                );
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

/**
 * A material's history at a location (CM-506): every ledger entry, newest
 * first, with its source document, counterparty, site location, remark,
 * who and the running balance. Reversals from edits and deletes are shown
 * as such. Hand entries (Consume, Missing, Opening) can be edited; any
 * hand entry, adjustments too, can be deleted.
 */
export function StockHistorySheet({
  location,
  row,
  canUpdate,
  canDelete,
  onClose,
}: {
  location: StockLocation;
  /** Null keeps it closed. */
  row: InventoryRow | null;
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [last, setLast] = useState(row);
  if (row != null && row !== last) setLast(row);
  const shown = row ?? last;
  return (
    <Sheet
      open={row != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="min-w-0 pr-10">
          <SheetTitle>History</SheetTitle>
          <SheetDescription className="truncate" title={shown?.materialName}>
            {shown?.materialName}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {shown == null ? null : (
            <Suspense
              fallback={
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              }
            >
              <Entries
                key={shown.materialId}
                location={location}
                row={shown}
                canUpdate={canUpdate}
                canDelete={canDelete}
              />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
