"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  Clock,
  HandCoins,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useState, useTransition } from "react";
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
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  settlementsQuery,
  useBulkDecideSettlements,
  useDecideSettlement,
  type PartyType,
  type Settlement,
} from "@/src/queries/finance-parties";
import { QueryHttpError } from "@/src/queries/http";

import { formatDate, money, PARTY_SCREENS } from "./party-money";
import { SettlementsSkeleton } from "./parties-skeletons";

type Status = "pending" | "approved" | "rejected";

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_ICONS: Record<Status, LucideIcon> = {
  pending: Clock,
  approved: CircleCheck,
  rejected: CircleX,
};

const STATUS_TABS = (Object.keys(STATUS_LABELS) as Status[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
  icon: STATUS_ICONS[value],
}));

/** A refusal's message, with each refused settlement for a bulk one. */
function problemOf(error: unknown): string {
  const message = fieldForCode(error, {}).message;
  if (
    error instanceof QueryHttpError &&
    error.code === "BULK_DECISION_REFUSED" &&
    typeof error.details === "object" &&
    error.details != null &&
    "refusals" in error.details &&
    Array.isArray(error.details.refusals)
  ) {
    const reasons = (error.details.refusals as { message: string }[])
      .map((refusal) => refusal.message)
      .join(" ");
    return `${message} ${reasons}`;
  }
  return message;
}

/**
 * **Settlements** of one party type's invoices on the Project (CM-708,
 * ADR CM-0017 §7): pending first, approve or reject with a reason, one at
 * a time or the ticked ones together (all or none).
 */
export function SettlementList({
  projectId,
  partyType,
}: {
  projectId: string;
  partyType: PartyType;
}) {
  const [status, setStatus] = useState<Status>("pending");
  const [updating, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      <FilterTabs
        aria-label="Settlement status"
        items={STATUS_TABS}
        value={status}
        onValueChange={(next) => {
          startTransition(() => {
            setStatus(next);
          });
        }}
      />
      <div className={cn(updating && "opacity-60 transition-opacity")}>
        <Suspense fallback={<SettlementsSkeleton />}>
          <Settlements
            key={status}
            projectId={projectId}
            partyType={partyType}
            status={status}
          />
        </Suspense>
      </div>
    </div>
  );
}

function Settlements({
  projectId,
  partyType,
  status,
}: {
  projectId: string;
  partyType: PartyType;
  status: Status;
}) {
  const { data } = useSuspenseQuery(
    settlementsQuery({ status, projectId, partyType }),
  );
  const decide = useDecideSettlement();
  const bulk = useBulkDecideSettlements();
  const [chosen, setChosen] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  const screen = PARTY_SCREENS[partyType];
  const decidable = data.items.filter(
    (item) => item.actions.approve || item.actions.reject,
  );
  const canApprove = data.items.some((item) => item.actions.approve);
  const canReject = data.items.some((item) => item.actions.reject);
  const busy = decide.isPending || bulk.isPending;

  if (data.items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HandCoins />
          </EmptyMedia>
          <EmptyTitle>
            {status === "pending"
              ? "Nothing waiting for approval"
              : `No ${STATUS_LABELS[status].toLowerCase()} settlements`}
          </EmptyTitle>
          <EmptyDescription>
            Settle invoice on a {screen.label}&apos;s invoice asks to write off
            what is left; it waits here for someone with Approve on Parties.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const run = (
    input:
      | { ids: string[]; approve: true }
      | { ids: string[]; approve: false; reason: string },
  ) => {
    setProblem(undefined);
    const single = input.ids.length === 1 ? input.ids[0] : undefined;
    const done =
      single == null
        ? bulk.mutateAsync(input)
        : decide.mutateAsync(
            input.approve
              ? { id: single, approve: true }
              : { id: single, approve: false, reason: input.reason },
          );
    return done.then(
      () => {
        setChosen([]);
      },
      (error: unknown) => {
        setProblem(problemOf(error));
        throw error;
      },
    );
  };

  return (
    <div className="space-y-3">
      {status === "pending" && decidable.length > 0 && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={chosen.length > 0 && chosen.length === decidable.length}
              onCheckedChange={(next) => {
                setChosen(next ? decidable.map((item) => item.id) : []);
              }}
            />
            {chosen.length === 0
              ? "Select all"
              : `${String(chosen.length)} selected`}
          </Label>
          <div className="flex gap-2">
            {canApprove && (
              <Button
                size="sm"
                disabled={chosen.length === 0 || busy}
                onClick={() => {
                  void run({ ids: chosen, approve: true }).catch(
                    () => undefined,
                  );
                }}
              >
                Approve selected
              </Button>
            )}
            {canReject && (
              <Button
                size="sm"
                variant="outline"
                disabled={chosen.length === 0 || busy}
                onClick={() => {
                  setRejecting(chosen);
                }}
              >
                Reject selected
              </Button>
            )}
          </div>
        </div>
      )}
      <FormAlert message={problem} />
      <ul aria-label="Settlements" className="space-y-2">
        {data.items.map((item) => (
          <SettlementItem
            key={item.id}
            settlement={item}
            selectable={
              status === "pending" &&
              (item.actions.approve || item.actions.reject)
            }
            selected={chosen.includes(item.id)}
            busy={busy}
            onSelect={(next) => {
              setChosen((current) =>
                next
                  ? [...current, item.id]
                  : current.filter((id) => id !== item.id),
              );
            }}
            onApprove={() => {
              void run({ ids: [item.id], approve: true }).catch(
                () => undefined,
              );
            }}
            onReject={() => {
              setRejecting([item.id]);
            }}
          />
        ))}
      </ul>
      <RejectDialog
        ids={rejecting}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
        onReject={(ids, reason) => run({ ids, approve: false, reason })}
      />
    </div>
  );
}

function SettlementItem({
  settlement,
  selectable,
  selected,
  busy,
  onSelect,
  onApprove,
  onReject,
}: {
  settlement: Settlement;
  selectable: boolean;
  selected: boolean;
  busy: boolean;
  onSelect: (selected: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const invoice = settlement.invoice;
  const label = `${invoice.invoiceNumber} · ${invoice.party.name ?? "A removed party"}`;
  return (
    <li className="bg-card rounded-lg border p-3">
      <div className="flex items-start gap-3">
        {selectable && (
          <Checkbox
            aria-label={`Select ${invoice.invoiceNumber}`}
            checked={selected}
            onCheckedChange={(next) => {
              onSelect(next);
            }}
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 font-medium break-words">
              {label}
              {invoice.direction === "receivable" && (
                <Badge variant="outline" className="ml-2">
                  Sales
                </Badge>
              )}
            </p>
            <p className="shrink-0 font-semibold tabular-nums">
              {money(settlement.amount)}
            </p>
          </div>
          <p className="text-sm break-words">{settlement.reason}</p>
          <p className="text-muted-foreground text-xs">
            Raised by {settlement.raisedBy.name ?? "a member"} on{" "}
            {formatDate(settlement.createdAt.slice(0, 10))} · invoice{" "}
            {money(invoice.amount)}, balance now {money(invoice.balance)}
          </p>
          {settlement.status === "rejected" &&
            settlement.rejectReason != null && (
              <p className="text-muted-foreground text-xs">
                Rejected: {settlement.rejectReason}
              </p>
            )}
          {settlement.status !== "pending" && settlement.decidedBy != null && (
            <p className="text-muted-foreground text-xs">
              {settlement.status === "approved" ? "Approved" : "Rejected"} by{" "}
              {settlement.decidedBy.name ?? "a member"}
            </p>
          )}
          {(settlement.actions.approve || settlement.actions.reject) && (
            <div className="flex gap-2 pt-1">
              {settlement.actions.approve && (
                <Button
                  size="sm"
                  disabled={busy}
                  aria-label={`Approve ${invoice.invoiceNumber}`}
                  onClick={onApprove}
                >
                  Approve
                </Button>
              )}
              {settlement.actions.reject && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Reject ${invoice.invoiceNumber}`}
                  onClick={onReject}
                >
                  Reject
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function RejectDialog({
  ids,
  onOpenChange,
  onReject,
}: {
  ids: string[] | null;
  onOpenChange: (open: boolean) => void;
  onReject: (ids: string[], reason: string) => Promise<void>;
}) {
  const [shown, setShown] = useState(ids);
  if (ids != null && ids !== shown) setShown(ids);
  const current = ids ?? shown ?? [];
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={ids != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {current.length === 1
              ? "Reject the settlement?"
              : `Reject ${String(current.length)} settlements?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The invoices stay open with their balance. The person who raised
            each one sees the reason.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="settlement-reject-reason" required>
            Reason
          </Label>
          <Textarea
            id="settlement-reject-reason"
            rows={3}
            maxLength={500}
            value={reason}
            aria-required
            aria-invalid={error != null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <FieldError message={error} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (reason.trim() === "") {
                setError("Say why");
                return;
              }
              setError(undefined);
              setPending(true);
              onReject(current, reason.trim()).then(
                () => {
                  setPending(false);
                  setReason("");
                  onOpenChange(false);
                },
                () => {
                  setPending(false);
                  onOpenChange(false);
                },
              );
            }}
          >
            {pending ? "Rejecting…" : "Reject"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
