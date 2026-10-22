"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { FinanceDocumentActivity } from "@/components/finance/documents/finance-document-activity";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  invoiceQuery,
  useDecideSettlement,
  useDeleteInvoice,
  useSettleInvoice,
  type Invoice,
  type PartyType,
} from "@/src/queries/finance-parties";

import { InvoiceDialog } from "./invoice-dialog";
import { formatDate, money, partyPaths } from "./party-money";
import { InvoiceStatusChips } from "./party-status";
import { InvoiceDetailSkeleton } from "./parties-skeletons";

/**
 * One invoice (CM-705): its figures, GRNs and variance, the payments that
 * settle it and its settlements, with Edit, Delete, Settle Invoice, Pay
 * and — for approvers — Approve or Reject a pending settlement.
 */
export function InvoiceSheet({
  projectId,
  partyType,
  invoiceId,
  onOpenChange,
}: {
  projectId: string;
  partyType: PartyType;
  invoiceId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [shown, setShown] = useState(invoiceId);
  if (invoiceId != null && invoiceId !== shown) setShown(invoiceId);
  const id = invoiceId ?? shown;
  const query = useQuery({ ...invoiceQuery(id ?? ""), enabled: id != null });
  const invoice = query.data;
  return (
    <Sheet open={invoiceId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {invoice == null ? "Invoice" : `Invoice ${invoice.invoiceNumber}`}
          </SheetTitle>
          <SheetDescription>
            {invoice?.party.name ?? ""}
            {invoice?.direction === "receivable" ? " · sales invoice" : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {invoice == null ? (
            <InvoiceDetailSkeleton />
          ) : (
            <InvoiceDetail
              projectId={projectId}
              partyType={partyType}
              invoice={invoice}
              onDeleted={() => {
                onOpenChange(false);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function InvoiceDetail({
  projectId,
  partyType,
  invoice,
  onDeleted,
}: {
  projectId: string;
  partyType: PartyType;
  invoice: Invoice;
  onDeleted: () => void;
}) {
  const access = useQuery(financeAccessQuery(projectId)).data;
  const canApprove =
    access != null && canInFinance(access, "finance.parties", "approve");
  const canReject =
    access != null && canInFinance(access, "finance.parties", "reject");
  const canFiles =
    access != null &&
    (canInFinance(access, "finance.parties", "create") ||
      canInFinance(access, "finance.parties", "update"));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settling, setSettling] = useState(false);
  const paths = partyPaths(projectId, partyType);
  const facts: [string, string][] = [
    ["Invoice date", formatDate(invoice.invoiceDate)],
    ["Due date", formatDate(invoice.dueDate)],
    ...(invoice.department == null
      ? []
      : ([["Department", invoice.department.name ?? "—"]] as [
          string,
          string,
        ][])),
    ...(invoice.taxableAmount == null
      ? []
      : ([["Taxable value", money(invoice.taxableAmount)]] as [
          string,
          string,
        ][])),
    ...(invoice.gstAmount == null
      ? []
      : ([["GST", money(invoice.gstAmount)]] as [string, string][])),
    ["Amount", money(invoice.amount)],
    ["Paid (with TDS)", money(invoice.allocated)],
    ...(invoice.writtenOff > 0
      ? ([["Written off", money(invoice.writtenOff)]] as [string, string][])
      : []),
    ["Balance", money(invoice.balance)],
  ];
  return (
    <div className="space-y-5">
      <InvoiceStatusChips invoice={invoice} />
      {invoice.origin === "ra_bill" && invoice.sourceId != null ? (
        <p className="text-sm">
          From Contractor Bill{" "}
          <Link
            href={`/app/projects/${projectId}/contractor-bills/${invoice.sourceId}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {invoice.invoiceNumber}
          </Link>
          . Reverse the bill in Contracts to change it.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {invoice.remarks != null && (
        <p className="text-sm whitespace-pre-line">{invoice.remarks}</p>
      )}
      {invoice.goodsReceipts.length > 0 && (
        <section aria-labelledby="invoice-grns" className="space-y-1">
          <h3 id="invoice-grns" className="text-sm font-semibold">
            Goods Receipts
          </h3>
          <ul className="space-y-0.5 text-sm">
            {invoice.goodsReceipts.map((grn) => (
              <li key={grn.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {grn.number ?? "A deleted GRN"}
                </span>
                <span className="tabular-nums">{money(grn.grnValue)}</span>
              </li>
            ))}
          </ul>
          {invoice.variance && (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              The invoice differs from the GRN value of{" "}
              {money(invoice.grnValue)} by{" "}
              {money(Math.abs(invoice.amount - (invoice.grnValue ?? 0)))}.
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="invoice-payments" className="space-y-1">
        <h3 id="invoice-payments" className="text-sm font-semibold">
          Payments
        </h3>
        {invoice.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing paid yet.</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {invoice.payments.map((payment) => (
              <li
                key={payment.paymentId}
                className="flex justify-between gap-3"
              >
                <Link
                  href={paths.payment(payment.paymentId)}
                  className="min-w-0 truncate hover:underline"
                >
                  {payment.number} · {formatDate(payment.paymentDate)}
                </Link>
                <span className="tabular-nums">{money(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {invoice.settlements.length > 0 && (
        <section aria-labelledby="invoice-settlements" className="space-y-2">
          <h3 id="invoice-settlements" className="text-sm font-semibold">
            Settlements
          </h3>
          <ul className="space-y-2 text-sm">
            {invoice.settlements.map((settlement) => (
              <li key={settlement.id} className="rounded-lg border p-2">
                <p>
                  <span className="font-medium capitalize">
                    {settlement.status}
                  </span>{" "}
                  · {money(settlement.amount)} · {settlement.reason}
                </p>
                {settlement.rejectReason != null && (
                  <p className="text-muted-foreground">
                    Rejected: {settlement.rejectReason}
                  </p>
                )}
                {settlement.status === "pending" &&
                  (canApprove || canReject) && (
                    <SettlementDecision
                      settlementId={settlement.id}
                      canApprove={canApprove}
                      canReject={canReject}
                    />
                  )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {invoice.actions.pay && (
          <Link
            href={paths.pay(
              invoice.party.id,
              invoice.direction === "receivable" ? "in" : "out",
            )}
            className={buttonVariants({ size: "sm" })}
          >
            {invoice.direction === "receivable" ? "Receive payment" : "Pay"}
          </Link>
        )}
        {invoice.actions.edit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
        {invoice.actions.settle && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSettling(true);
            }}
          >
            Settle invoice
          </Button>
        )}
        {invoice.actions.delete && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete
          </Button>
        )}
      </div>
      <FinanceDocumentActivity
        documentType="invoice"
        documentId={invoice.id}
        canEdit={canFiles}
      />
      <InvoiceDialog
        projectId={projectId}
        partyType={partyType}
        target={editing ? { mode: "edit", invoice } : null}
        onOpenChange={(open) => {
          if (!open) setEditing(false);
        }}
      />
      <SettleDialog
        invoice={settling ? invoice : null}
        onOpenChange={(open) => {
          if (!open) setSettling(false);
        }}
      />
      <DeleteInvoiceDialog
        invoice={deleting ? invoice : null}
        onOpenChange={(open) => {
          if (!open) setDeleting(false);
        }}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function SettlementDecision({
  settlementId,
  canApprove,
  canReject,
}: {
  settlementId: string;
  canApprove: boolean;
  canReject: boolean;
}) {
  const decide = useDecideSettlement();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const run = async (
    input:
      | { id: string; approve: true }
      | { id: string; approve: false; reason: string },
  ) => {
    setProblem(undefined);
    try {
      await decide.mutateAsync(input);
    } catch (error) {
      setProblem(fieldForCode(error, {}).message);
    }
  };
  return (
    <div className="mt-2 space-y-2">
      {rejecting && (
        <div className="space-y-1">
          <Label htmlFor={`reject-${settlementId}`}>Reason to reject</Label>
          <Textarea
            id={`reject-${settlementId}`}
            rows={2}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </div>
      )}
      <FormAlert message={problem} />
      <div className="flex gap-2">
        {canApprove && !rejecting && (
          <Button
            size="sm"
            disabled={decide.isPending}
            onClick={() => {
              void run({ id: settlementId, approve: true });
            }}
          >
            Approve
          </Button>
        )}
        {canReject &&
          (rejecting ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={decide.isPending || reason.trim() === ""}
              onClick={() => {
                void run({ id: settlementId, approve: false, reason });
              }}
            >
              Reject settlement
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRejecting(true);
              }}
            >
              Reject
            </Button>
          ))}
      </div>
    </div>
  );
}

/** **Settle Invoice**: a reason, then the write-off waits for approval (CM-0017 §7). */
export function SettleDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [shown, setShown] = useState(invoice);
  if (invoice != null && invoice !== shown) setShown(invoice);
  const current = invoice ?? shown;
  const settle = useSettleInvoice(current?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <AlertDialog open={invoice != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Settle invoice {current?.invoiceNumber}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Writes off the balance of {money(current?.balance)} once someone
            with Approve on Parties approves it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="settle-reason">Reason</Label>
          <Textarea
            id="settle-reason"
            rows={3}
            maxLength={500}
            value={reason}
            aria-invalid={error != null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <FieldError message={error} />
        </div>
        <FormAlert message={problem} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={settle.isPending}
            onClick={() => {
              setError(undefined);
              setProblem(undefined);
              if (reason.trim() === "") {
                setError("Say why the rest is written off");
                return;
              }
              settle.mutateAsync(reason.trim()).then(
                () => {
                  setReason("");
                  onOpenChange(false);
                },
                (failure: unknown) => {
                  setProblem(fieldForCode(failure, {}).message);
                },
              );
            }}
          >
            {settle.isPending ? "Sending…" : "Send for approval"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteInvoiceDialog({
  invoice,
  onOpenChange,
  onDeleted,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [shown, setShown] = useState(invoice);
  if (invoice != null && invoice !== shown) setShown(invoice);
  const current = invoice ?? shown;
  const remove = useDeleteInvoice(current?.id ?? "");
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <AlertDialog open={invoice != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete invoice {current?.invoiceNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its amount leaves the party&apos;s balance. Goods Receipts on it
            wait for an invoice again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={problem} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (current == null) return;
              setProblem(undefined);
              remove.mutateAsync(current.updatedAt).then(
                () => {
                  onOpenChange(false);
                  onDeleted();
                },
                (failure: unknown) => {
                  setProblem(fieldForCode(failure, {}).message);
                },
              );
            }}
          >
            {remove.isPending ? "Deleting…" : "Delete invoice"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
