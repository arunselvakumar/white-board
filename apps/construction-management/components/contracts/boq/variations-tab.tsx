"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileDiff, Plus } from "lucide-react";
import { Suspense, useId, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import type { VariationStatus } from "@/src/contracts/domain/variation";
import {
  useVariationCommand,
  variationsQuery,
  type BoqItem,
  type Variation,
  type VariationFilter,
} from "@/src/queries/contracts-boq";
import type { Flag } from "@/src/shared-kernel/access";

import { KIND_LABELS, variationChange } from "./boq-format";
import { VariationDialog } from "./variation-dialog";

const ALL = "__all__";

const STATUS_LABELS: Record<VariationStatus, string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_ITEMS = [
  { value: ALL, label: "All statuses" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function statusVariant(status: VariationStatus) {
  if (status === "approved") return "default" as const;
  if (status === "rejected") return "destructive" as const;
  return "secondary" as const;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Reject with a reason (BOQ Reject). */
function RejectDialog({
  variation,
  onClose,
}: {
  variation: Variation;
  onClose: () => void;
}) {
  const id = useId();
  const command = useVariationCommand();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim() === "") {
              setError("Write why it is rejected.");
              return;
            }
            command.mutate(
              { kind: "reject", id: variation.id, reason },
              {
                onSuccess: onClose,
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
                },
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Reject Variation {variation.number}?</DialogTitle>
            <DialogDescription>
              The BOQ stays as it is. Whoever raised it sees your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <Textarea
              id={`${id}-reason`}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </div>
          <FormAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={command.isPending}
            >
              {command.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VariationCard({
  variation,
  flags,
  busy,
  onApprove,
  onReject,
  onEdit,
  onDelete,
}: {
  variation: Variation;
  flags: readonly Flag[];
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pending = variation.status === "pending_approval";
  const canEdit =
    pending && (flags.includes("update") || flags.includes("create"));
  return (
    <li className="bg-card min-w-0 space-y-2 rounded-xl border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{variation.number}</span>
        <Badge variant="outline">{KIND_LABELS[variation.kind]}</Badge>
        <Badge variant={statusVariant(variation.status)}>
          {STATUS_LABELS[variation.status]}
        </Badge>
      </div>
      <p className="min-w-0 text-sm break-words">
        <span className="font-medium tabular-nums">
          {variation.boqItemNo ?? variation.itemNo}
        </span>{" "}
        {variation.boqItemDescription ?? variation.description}
        {variation.sectionTitle == null ? null : (
          <span className="text-muted-foreground">
            {" "}
            · {variation.sectionTitle}
          </span>
        )}
      </p>
      <p className="text-sm font-medium tabular-nums">
        {variationChange(variation)}
      </p>
      <p className="text-muted-foreground text-sm break-words">
        {variation.reason}
      </p>
      <p className="text-muted-foreground text-xs">
        Raised by {variation.createdByName ?? "someone"} on{" "}
        {when(variation.createdAt)}
        {variation.decidedAt == null
          ? ""
          : ` · ${variation.status === "approved" ? "approved" : "rejected"} by ${variation.decidedByName ?? "someone"} on ${when(variation.decidedAt)}`}
      </p>
      {variation.rejectReason == null ? null : (
        <p className="text-destructive text-sm break-words">
          {variation.rejectReason}
        </p>
      )}
      {pending ? (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {canEdit ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={onDelete}
              >
                Delete
              </Button>
            </>
          ) : null}
          {flags.includes("reject") ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onReject}
            >
              Reject
            </Button>
          ) : null}
          {flags.includes("approve") ? (
            <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
              Approve
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function VariationList({
  projectId,
  filter,
  flags,
  financial,
  items,
  onPage,
}: {
  projectId: string;
  filter: VariationFilter;
  flags: readonly Flag[];
  financial: boolean;
  items: readonly BoqItem[];
  onPage: (cursor: VariationFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(variationsQuery(projectId, filter));
  const command = useVariationCommand();
  const [rejecting, setRejecting] = useState<Variation | null>(null);
  const [editing, setEditing] = useState<Variation | null>(null);
  const [error, setError] = useState<string | undefined>();
  const run = (input: Parameters<typeof command.mutate>[0]) => {
    setError(undefined);
    command.mutate(input, {
      onError: (failure) => {
        setError(fieldForCode(failure, {}).message);
      },
    });
  };
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileDiff />
          </EmptyMedia>
          <EmptyTitle>
            {filter.status === ""
              ? "No Variations yet"
              : "None with this status"}
          </EmptyTitle>
          <EmptyDescription>
            A Variation adds an extra item or changes an item’s quantity or rate
            once work is measured. It changes the BOQ when approved.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Variation" : "Variations"}
      </p>
      <FormAlert message={error} />
      <ul aria-label="Variations" className="space-y-3">
        {data.items.map((variation) => (
          <VariationCard
            key={variation.id}
            variation={variation}
            flags={flags}
            busy={command.isPending}
            onApprove={() => {
              run({ kind: "approve", id: variation.id });
            }}
            onReject={() => {
              setRejecting(variation);
            }}
            onEdit={() => {
              setEditing(variation);
            }}
            onDelete={() => {
              run({
                kind: "delete",
                id: variation.id,
                expectedUpdatedAt: variation.updatedAt,
              });
            }}
          />
        ))}
      </ul>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Next
          </Button>
        </div>
      )}
      {rejecting == null ? null : (
        <RejectDialog
          variation={rejecting}
          onClose={() => {
            setRejecting(null);
          }}
        />
      )}
      {editing == null ? null : (
        <VariationDialog
          projectId={projectId}
          financial={financial}
          items={items}
          variation={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The BOQ's Variations (CM-1103): newest first with a status filter.
 * Approve and Reject show by the viewer's BOQ flags; a pending one can be
 * edited or deleted by whoever raised it or a holder of Edit.
 */
export function VariationsTab({
  projectId,
  flags,
  financial,
  items,
}: {
  projectId: string;
  flags: readonly Flag[];
  financial: boolean;
  items: readonly BoqItem[];
}) {
  const [filter, setFilter] = useState<VariationFilter>({
    status: "",
    cursor: null,
  });
  const [raising, setRaising] = useState(false);
  const [paging, startPaging] = useTransition();
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          items={STATUS_ITEMS}
          value={filter.status === "" ? ALL : filter.status}
          onValueChange={(next) => {
            if (next == null) return;
            startPaging(() => {
              setFilter({
                status: next === ALL ? "" : (next as VariationStatus),
                cursor: null,
              });
            });
          }}
        >
          <SelectTrigger
            aria-label="Status"
            className="h-9 w-full min-w-0 sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {flags.includes("create") && items.length > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setRaising(true);
            }}
          >
            <Plus aria-hidden="true" />
            Raise Variation
          </Button>
        ) : null}
      </div>
      <div className={cn(paging && "opacity-60 transition-opacity")}>
        <Suspense
          fallback={
            <p className="text-muted-foreground text-sm">Loading Variations…</p>
          }
        >
          <VariationList
            projectId={projectId}
            filter={filter}
            flags={flags}
            financial={financial}
            items={items}
            onPage={(cursor) => {
              startPaging(() => {
                setFilter((current) => ({ ...current, cursor }));
              });
            }}
          />
        </Suspense>
      </div>
      {raising ? (
        <VariationDialog
          projectId={projectId}
          financial={financial}
          items={items}
          variation={null}
          onClose={() => {
            setRaising(false);
          }}
        />
      ) : null}
    </div>
  );
}
