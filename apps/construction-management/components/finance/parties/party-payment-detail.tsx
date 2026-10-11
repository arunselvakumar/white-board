"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";

import { PageHeader } from "@/components/app-shell/page-header";
import { FinanceDocumentActivity } from "@/components/finance/documents/finance-document-activity";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  outstandingInvoicesQuery,
  partyPaymentQuery,
  partyPaymentReceiptUrl,
  useApplyAdvance,
  useCancelPartyPayment,
  type PartyPayment,
  type PartyType,
} from "@/src/queries/finance-parties";

import {
  AllocationTable,
  allocatedTotal,
  allocationsOf,
  type AllocationValues,
} from "./allocation-table";
import {
  formatDate,
  MODE_LABELS,
  money,
  PARTY_SCREENS,
  partyPaths,
} from "./party-money";

/**
 * One party payment (CM-705): what moved and from which account, the TDS,
 * the invoices it settles and the advance left, with the receipt PDF,
 * **Apply advance** and **Cancel** (both ledgers reversed).
 */
export function PartyPaymentDetail({
  projectId,
  partyType,
  paymentId,
}: {
  projectId: string;
  partyType: PartyType;
  paymentId: string;
}) {
  const router = useRouter();
  const { data: payment } = useSuspenseQuery(partyPaymentQuery(paymentId));
  const access = useQuery(financeAccessQuery(projectId)).data;
  const canFiles =
    access != null &&
    (canInFinance(access, "finance.parties", "create") ||
      canInFinance(access, "finance.parties", "update"));
  const paths = partyPaths(projectId, partyType);
  const screen = PARTY_SCREENS[partyType];
  const [cancelling, setCancelling] = useState(false);
  const [applying, setApplying] = useState(false);
  const inbound = payment.direction === "in";
  const facts: [string, string][] = [
    [inbound ? "Received from" : "Paid to", payment.party.name ?? "—"],
    ["Date", formatDate(payment.paymentDate)],
    [inbound ? "Received into" : "Paid from", payment.account.name ?? "—"],
    ["Mode", MODE_LABELS[payment.mode]],
    ...(payment.chequeNumber == null
      ? []
      : ([["Cheque number", payment.chequeNumber]] as [string, string][])),
    ...(payment.reference == null
      ? []
      : ([["Reference", payment.reference]] as [string, string][])),
    ...(payment.modeDate == null
      ? []
      : ([["Mode date", formatDate(payment.modeDate)]] as [string, string][])),
    [inbound ? "Received" : "Paid", money(payment.amount)],
    ...(payment.tds == null || payment.tds.amount === 0
      ? []
      : ([
          [
            `TDS ${payment.tds.section ?? ""}`.trim(),
            `${money(payment.tds.amount)}${payment.tds.rate == null ? "" : ` at ${payment.tds.rate}%`}`,
          ],
          ["Settled", money(payment.settled)],
        ] as [string, string][])),
    ["Allocated", money(payment.allocated)],
    ["Advance", money(payment.unallocated)],
    ...(payment.paymentCategory == null
      ? []
      : ([["Payment Category", payment.paymentCategory.name ?? "—"]] as [
          string,
          string,
        ][])),
    ...(payment.paidBy == null
      ? []
      : ([
          [inbound ? "Received by" : "Paid by", payment.paidBy.name ?? "—"],
        ] as [string, string][])),
  ];
  return (
    <div className="w-full max-w-4xl space-y-6">
      <PageHeader
        back={{
          label: payment.party.name ?? screen.plural,
          href: paths.party(payment.party.id),
        }}
        title={payment.number}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {inbound ? "Payment In" : "Payment Out"}
            </Badge>
            {payment.tds?.overridden === true && (
              <Badge variant="outline">TDS changed</Badge>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {payment.actions.print && (
              <a
                href={partyPaymentReceiptUrl(payment.id)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download aria-hidden="true" />
                Receipt PDF
              </a>
            )}
            {payment.actions.applyAdvance && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setApplying(true);
                }}
              >
                Apply advance
              </Button>
            )}
            {payment.actions.cancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setCancelling(true);
                }}
              >
                Cancel payment
              </Button>
            )}
          </div>
        }
      />
      <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {payment.tds?.overridden === true && (
        <p className="text-sm">
          <span className="text-muted-foreground">
            TDS suggested {money(payment.tds.suggested)}; changed because:{" "}
          </span>
          {payment.tds.overrideReason}
        </p>
      )}
      {payment.remarks != null && (
        <p className="text-sm whitespace-pre-line">{payment.remarks}</p>
      )}
      <section aria-labelledby="payment-allocations" className="space-y-2">
        <h2 id="payment-allocations" className="font-semibold">
          Invoices it settles
        </h2>
        {payment.allocations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None yet: the whole payment is an advance.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {payment.allocations.map((allocation) => (
              <li
                key={allocation.id}
                className="flex justify-between gap-3 p-3"
              >
                <span className="min-w-0 truncate">
                  {allocation.invoiceNumber ?? "A deleted invoice"}
                  {allocation.invoiceDate != null &&
                    ` · ${formatDate(allocation.invoiceDate)}`}
                </span>
                <span className="tabular-nums">{money(allocation.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <FinanceDocumentActivity
        documentType="party_payment"
        documentId={payment.id}
        canEdit={canFiles}
      />
      <CancelPaymentDialog
        payment={cancelling ? payment : null}
        onOpenChange={(open) => {
          if (!open) setCancelling(false);
        }}
        onCancelled={() => {
          router.push(paths.party(payment.party.id));
        }}
      />
      <ApplyAdvanceDialog
        projectId={projectId}
        partyType={partyType}
        payment={applying ? payment : null}
        onOpenChange={(open) => {
          if (!open) setApplying(false);
        }}
      />
    </div>
  );
}

function CancelPaymentDialog({
  payment,
  onOpenChange,
  onCancelled,
}: {
  payment: PartyPayment | null;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const [shown, setShown] = useState(payment);
  if (payment != null && payment !== shown) setShown(payment);
  const current = payment ?? shown;
  const cancel = useCancelPartyPayment(current?.id ?? "");
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <AlertDialog open={payment != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {current?.number}?</AlertDialogTitle>
          <AlertDialogDescription>
            The {money(current?.amount)} goes back to{" "}
            {current?.account.name ?? "the account"}, the party&apos;s balance
            is restored and its invoices open again. Record the payment again if
            it was wrong.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={problem} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              if (current == null) return;
              setProblem(undefined);
              cancel.mutateAsync(current.updatedAt).then(
                () => {
                  onOpenChange(false);
                  onCancelled();
                },
                (failure: unknown) => {
                  setProblem(fieldForCode(failure, {}).message);
                },
              );
            }}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel payment"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** **Apply advance**: allocate what the payment has not settled yet (no money moves). */
export function ApplyAdvanceDialog({
  projectId,
  partyType,
  payment,
  onOpenChange,
}: {
  projectId: string;
  partyType: PartyType;
  payment: PartyPayment | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [shown, setShown] = useState(payment);
  if (payment != null && payment !== shown) setShown(payment);
  const current = payment ?? shown;
  return (
    <Dialog open={payment != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply advance</DialogTitle>
          <DialogDescription>
            {money(current?.unallocated)} of {current?.number} is not settling
            any invoice yet.
          </DialogDescription>
        </DialogHeader>
        {payment != null && (
          <ApplyAdvanceForm
            projectId={projectId}
            partyType={partyType}
            payment={payment}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplyAdvanceForm({
  projectId,
  partyType,
  payment,
  onDone,
}: {
  projectId: string;
  partyType: PartyType;
  payment: PartyPayment;
  onDone: () => void;
}) {
  const outstanding = useQuery(
    outstandingInvoicesQuery(
      projectId,
      partyType,
      payment.party.id,
      payment.direction === "in" ? "receivable" : "payable",
    ),
  );
  const apply = useApplyAdvance(payment.id);
  const [values, setValues] = useState<AllocationValues>({});
  const [problem, setProblem] = useState<string | undefined>();
  const total = allocatedTotal(values);
  if (outstanding.data == null) return <Skeleton className="h-20 w-full" />;
  return (
    <div className="space-y-4">
      <AllocationTable
        idPrefix="advance"
        invoices={outstanding.data.items}
        values={values}
        onChange={setValues}
        available={payment.unallocated}
      />
      <p className="text-muted-foreground text-sm">
        Applying {money(total)} of {money(payment.unallocated)}
      </p>
      <FormAlert message={problem} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={
            apply.isPending || total <= 0 || total > payment.unallocated
          }
          onClick={() => {
            setProblem(undefined);
            apply
              .mutateAsync({
                expectedUpdatedAt: payment.updatedAt,
                allocations: allocationsOf(values),
              })
              .then(onDone, (failure: unknown) => {
                setProblem(fieldForCode(failure, {}).message);
              });
          }}
        >
          {apply.isPending ? "Applying…" : "Apply"}
        </Button>
      </DialogFooter>
    </div>
  );
}
