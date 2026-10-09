"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  partyStatementQuery,
  type PaymentPartyType,
  type StatementLine,
} from "@/src/queries/balances";
import { PAYMENTS_API, useCancelPayment } from "@/src/queries/payments";

import { formatDate, KIND_LABELS, money, sourceLabel } from "./payment-format";

export type StatementTarget = { id: string; name: string };

/**
 * One party's balance view (CM-216): every entry in the period with its
 * Project and the running balance. A payment can be cancelled from here.
 */
export function StatementSheet({
  projectId,
  partyType,
  party,
  range,
  onOpenChange,
}: {
  projectId: string;
  partyType: PaymentPartyType;
  party: StatementTarget | null;
  range: { from: string; to: string };
  onOpenChange: (open: boolean) => void;
}) {
  const [shown, setShown] = useState<StatementTarget | null>(party);
  if (party != null && party !== shown) setShown(party);
  const target = party ?? shown;
  return (
    <Sheet open={party != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{target?.name ?? "Statement"}</SheetTitle>
          <SheetDescription>
            {formatDate(range.from)} – {formatDate(range.to)}. A balance belongs
            to the {partyType === "labour" ? "Labour" : "Vendor"} across
            Projects.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {party != null && (
            <Suspense
              fallback={
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              }
            >
              <StatementLines
                projectId={projectId}
                partyType={partyType}
                partyId={party.id}
                range={range}
              />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function canCancel(line: StatementLine): boolean {
  return (
    line.payment != null &&
    !line.payment.cancelled &&
    !line.isReversal &&
    !line.isReversed
  );
}

function StatementLines({
  projectId,
  partyType,
  partyId,
  range,
}: {
  projectId: string;
  partyType: PaymentPartyType;
  partyId: string;
  range: { from: string; to: string };
}) {
  const { data } = useSuspenseQuery(
    partyStatementQuery({
      projectId,
      partyType,
      partyId,
      from: range.from,
      to: range.to,
    }),
  );
  const cancel = useCancelPayment();
  const [pending, setPending] = useState<StatementLine | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Previous Balance</dt>
          <dd className="font-medium tabular-nums">
            {money(data.openingBalance)}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-muted-foreground">Closing balance</dt>
          <dd className="font-semibold tabular-nums">
            {money(data.closingBalance)}
          </dd>
        </div>
      </dl>
      <FormAlert message={error} />
      {data.lines.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No entries in this period.
        </p>
      ) : (
        <ol aria-label="Entries" className="space-y-2">
          {data.lines.map((line) => {
            const muted = line.isReversal || line.isReversed;
            return (
              <li
                key={line.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  muted && "bg-muted/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-muted-foreground text-xs">
                      {formatDate(line.date)}
                      {line.projectName != null && ` · ${line.projectName}`}
                    </p>
                    <p
                      className={cn(
                        "flex flex-wrap items-center gap-1.5 text-sm font-medium",
                        line.isReversed && "line-through",
                      )}
                    >
                      {line.isReversal
                        ? sourceLabel(line)
                        : KIND_LABELS[line.kind]}
                      {line.payment != null && !line.isReversal && (
                        <Badge variant="outline">
                          {line.payment.mode === "bank" ? "Bank" : "Cash"}
                        </Badge>
                      )}
                      {line.payment?.cancelled === true && !line.isReversal && (
                        <Badge variant="secondary">Cancelled</Badge>
                      )}
                    </p>
                    {line.payment?.reference != null && (
                      <p className="text-muted-foreground text-xs">
                        Ref. {line.payment.reference}
                      </p>
                    )}
                    {line.payment?.remarks != null && !line.isReversal && (
                      <p className="text-muted-foreground text-xs">
                        {line.payment.remarks}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        line.amount != null &&
                          line.amount < 0 &&
                          "text-destructive",
                      )}
                    >
                      {line.amount != null && line.amount > 0 ? "+" : ""}
                      {money(line.amount)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      Balance {money(line.balance)}
                    </p>
                  </div>
                </div>
                {line.payment != null && !line.isReversal && (
                  <div className="mt-2 flex justify-end gap-2">
                    {line.payment.hasReceipt && (
                      <a
                        href={`${PAYMENTS_API}/${encodeURIComponent(line.payment.id)}/receipt`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        <FileText aria-hidden="true" className="size-3.5" />
                        Receipt
                      </a>
                    )}
                    {canCancel(line) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-7"
                        onClick={() => {
                          setError(undefined);
                          setPending(line);
                          setConfirming(true);
                        }}
                      >
                        Cancel payment
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel this {pending?.kind === "advance" ? "advance" : "payment"}
              {pending == null ? "" : ` of ${money(-(pending.amount ?? 0))}`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The amount goes back onto the balance. The payment stays in the
              history as cancelled. To correct it, cancel and record it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => {
                const payment = pending?.payment;
                if (payment == null) return;
                cancel.mutate(
                  { id: payment.id, expectedUpdatedAt: payment.updatedAt },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                    },
                    onError: (failure) => {
                      setConfirming(false);
                      setError(fieldForCode(failure, {}).message);
                    },
                  },
                );
              }}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel payment"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
