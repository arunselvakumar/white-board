"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText, Wallet } from "lucide-react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  paymentsQuery,
  useCancelPayment,
  type PaymentListFilter,
  type WagePayment,
} from "@/src/queries/payments";

import { formatDate, money } from "./payment-format";

const TYPES = [
  { value: "all", label: "All" },
  { value: "labour", label: "Labour" },
  { value: "vendor", label: "Vendor" },
] as const;

const KINDS = [
  { value: "all", label: "All" },
  { value: "payment", label: "Payments" },
  { value: "advance", label: "Advances" },
] as const;

/** Recorded payments of a Project with filters and cancel (CM-216). */
export function PaymentsList({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<PaymentListFilter>({
    projectId,
    partyType: null,
    kind: null,
    from: "",
    to: "",
    cursor: null,
  });
  const change = (next: Partial<PaymentListFilter>) => {
    setFilter((current) => ({ ...current, ...next, cursor: null }));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <ToggleGroup
          aria-label="Party type"
          value={[filter.partyType ?? "all"]}
          onValueChange={(value: string[]) => {
            const next = value[0];
            if (next == null) return;
            change({
              partyType: next === "labour" || next === "vendor" ? next : null,
            });
          }}
          variant="outline"
          size="sm"
        >
          {TYPES.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Kind"
          value={[filter.kind ?? "all"]}
          onValueChange={(value: string[]) => {
            const next = value[0];
            if (next == null) return;
            change({
              kind: next === "payment" || next === "advance" ? next : null,
            });
          }}
          variant="outline"
          size="sm"
        >
          {KINDS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="payments-from" className="text-xs">
              From
            </Label>
            <Input
              id="payments-from"
              type="date"
              className="h-8 w-40"
              value={filter.from}
              onChange={(event) => {
                change({ from: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payments-to" className="text-xs">
              To
            </Label>
            <Input
              id="payments-to"
              type="date"
              className="h-8 w-40"
              value={filter.to}
              onChange={(event) => {
                change({ to: event.target.value });
              }}
            />
          </div>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <PaymentRows
          filter={filter}
          onPage={(cursor) => {
            setFilter((current) => ({ ...current, cursor }));
          }}
        />
      </Suspense>
    </div>
  );
}

function ReceiptLink({ payment }: { payment: WagePayment }) {
  if (payment.receiptUrl == null) return null;
  return (
    <a
      href={payment.receiptUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Receipt for ${payment.partyName}`}
      className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
    >
      <FileText aria-hidden="true" className="size-3.5" />
      Receipt
    </a>
  );
}

function modeText(payment: WagePayment): string {
  const mode = payment.mode === "bank" ? "Bank" : "Cash";
  return payment.reference == null ? mode : `${mode} · ${payment.reference}`;
}

function PaymentRows({
  filter,
  onPage,
}: {
  filter: PaymentListFilter;
  onPage: (cursor: PaymentListFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(paymentsQuery(filter));
  const cancel = useCancelPayment();
  const [pending, setPending] = useState<WagePayment | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const filtered =
    filter.partyType != null ||
    filter.kind != null ||
    filter.from !== "" ||
    filter.to !== "";
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wallet />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No payments match" : "No payments yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another type, kind or date range."
              : "Pay a Labour or a Vendor from the Labour or Vendor tab; their payments list here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const ask = (payment: WagePayment) => {
    setError(undefined);
    setPending(payment);
    setConfirming(true);
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "payment" : "payments"}
        {data.totalAmount != null && ` · ${money(data.totalAmount)}`}
      </p>
      <FormAlert message={error} />
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Payments">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Paid by</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-32">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(payment.paymentDate)}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{payment.partyName}</p>
                  <p className="text-muted-foreground text-xs">
                    {payment.partyType === "labour" ? "Labour" : "Vendor"}
                    {payment.remarks != null && ` · ${payment.remarks}`}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      payment.kind === "advance" ? "outline" : "secondary"
                    }
                  >
                    {payment.kind === "advance" ? "Advance" : "Payment"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {modeText(payment)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {payment.paidBy?.name ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(payment.amount)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <ReceiptLink payment={payment} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Cancel payment to ${payment.partyName}`}
                      onClick={() => {
                        ask(payment);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Payments" className="space-y-2 md:hidden">
        {data.items.map((payment) => (
          <li key={payment.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{payment.partyName}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(payment.paymentDate)} · {modeText(payment)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {money(payment.amount)}
                </p>
                <Badge
                  variant={payment.kind === "advance" ? "outline" : "secondary"}
                >
                  {payment.kind === "advance" ? "Advance" : "Payment"}
                </Badge>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-3">
              <ReceiptLink payment={payment} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive h-7"
                aria-label={`Cancel payment to ${payment.partyName}`}
                onClick={() => {
                  ask(payment);
                }}
              >
                Cancel
              </Button>
            </div>
          </li>
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
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Older
          </Button>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel the {pending?.kind === "advance" ? "advance" : "payment"}{" "}
              to {pending?.partyName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.amount != null &&
                `${money(pending.amount)} goes back onto their balance. `}
              The payment stays in the history as cancelled. To correct it,
              cancel and record it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => {
                if (pending == null) return;
                cancel.mutate(
                  { id: pending.id, expectedUpdatedAt: pending.updatedAt },
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
