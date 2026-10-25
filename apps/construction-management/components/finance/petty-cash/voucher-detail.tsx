"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, Pencil, Trash2, XCircle } from "lucide-react";
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
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { FinanceDocumentActivity } from "@/components/finance/documents/finance-document-activity";
import { COUNTERPARTY_KIND_LABELS } from "@/components/finance/counterparty-field";
import { formatDate } from "@/components/payments/payment-format";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  pettyCashVoucherQuery,
  useDecideVoucher,
  useDeleteVoucher,
} from "@/src/queries/finance-petty-cash";

import {
  Amount,
  VOUCHER_TYPE_LABELS,
  VoucherStatusBadge,
  pettyCashPath,
  voucherSign,
} from "./petty-cash-parts";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/**
 * A petty-cash voucher (CM-703): its figures, its approval with the
 * reason of a rejection, the actions the viewer has (Edit, Approve,
 * Reject, Delete), and its photos, receipts and remarks (the finance
 * document thread).
 */
export function VoucherDetail({
  projectId,
  voucherId,
}: {
  projectId: string;
  voucherId: string;
}) {
  const router = useRouter();
  const { data: voucher } = useSuspenseQuery(pettyCashVoucherQuery(voucherId));
  const { data: access } = useSuspenseQuery(financeAccessQuery(projectId));
  const decide = useDecideVoucher();
  const remove = useDeleteVoucher();
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { actions } = voucher;
  const canAttach =
    canInFinance(access, "finance.petty_cash", "create") ||
    canInFinance(access, "finance.petty_cash", "update");
  const transfer = voucher.voucherType === "transfer";
  const party = voucher.counterparty;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <SiteRecordHeader
        back={{ label: "Petty Cash", href: pettyCashPath(projectId) }}
        title={voucher.number}
        size="detail"
        meta={`${VOUCHER_TYPE_LABELS[voucher.voucherType]} · ${formatDate(voucher.voucherDate)} · ${voucher.accountName}`}
        actions={
          <>
            {actions.edit ? (
              <Link
                href={pettyCashPath(projectId, `/${voucher.id}/edit`)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            ) : null}
            {actions.reject ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejecting(true);
                }}
              >
                <XCircle aria-hidden="true" />
                Reject
              </Button>
            ) : null}
            {actions.approve ? (
              <Button
                type="button"
                size="sm"
                disabled={decide.isPending}
                onClick={() => {
                  setError(undefined);
                  decide.mutate(
                    { id: voucher.id, approve: true },
                    {
                      onError: (failure) => {
                        setError(fieldForCode(failure, {}).message);
                      },
                    },
                  );
                }}
              >
                <CircleCheck aria-hidden="true" />
                Approve
              </Button>
            ) : null}
            {actions.delete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete ${voucher.number}`}
                onClick={() => {
                  remove.reset();
                  setDeleting(true);
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </>
        }
      />
      <FormAlert message={error} />
      <section className="bg-card space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Amount
            paise={voucherSign(voucher.voucherType) * voucher.amount}
            signed
            className="text-2xl font-semibold"
          />
          <VoucherStatusBadge status={voucher.approvalStatus} />
        </div>
        {voucher.approvalStatus === "rejected" ? (
          <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
            Rejected
            {voucher.decidedByName == null
              ? ""
              : ` by ${voucher.decidedByName}`}
            : {voucher.rejectReason}
          </p>
        ) : null}
        {voucher.approvalStatus === "pending" ? (
          <p className="text-muted-foreground text-sm">
            Waiting for approval. It moves the balance once approved.
          </p>
        ) : null}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Account">{voucher.accountName}</Fact>
          {transfer ? (
            <Fact label="To account">{voucher.toAccountName ?? "—"}</Fact>
          ) : (
            <Fact
              label={
                voucher.voucherType === "receipt" ? "Received from" : "Paid to"
              }
            >
              {party.name ?? "—"}
              {party.kind == null ? null : (
                <span className="text-muted-foreground">
                  {" "}
                  · {COUNTERPARTY_KIND_LABELS[party.kind]}
                </span>
              )}
            </Fact>
          )}
          {transfer ? null : (
            <Fact label="Payment Category">
              {voucher.paymentCategoryName ?? "—"}
            </Fact>
          )}
          <Fact label="Project">{voucher.projectName ?? "No Project"}</Fact>
          <Fact
            label={
              voucher.voucherType === "receipt" ? "Received for" : "Paid for"
            }
          >
            {voucher.paidFor ?? "—"}
          </Fact>
          <Fact label="Reference">{voucher.reference ?? "—"}</Fact>
          {voucher.description == null ? null : (
            <Fact label="Description" className="sm:col-span-2 lg:col-span-3">
              {voucher.description}
            </Fact>
          )}
          <Fact label="Written by">{voucher.createdByName ?? "—"}</Fact>
          {voucher.approvalStatus === "approved" ? (
            <Fact label="Approved by">{voucher.decidedByName ?? "—"}</Fact>
          ) : null}
        </dl>
      </section>
      <FinanceDocumentActivity
        documentType="petty_cash_voucher"
        documentId={voucher.id}
        canEdit={canAttach}
      />
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${voucher.number}?`}
        description="The writer can change it and send it again."
        action="Reject"
        onSubmit={async (reason) => {
          try {
            await decide.mutateAsync({
              id: voucher.id,
              approve: false,
              reason,
            });
          } catch (failure) {
            throw new Error(fieldForCode(failure, {}).message, {
              cause: failure,
            });
          }
        }}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {voucher.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {voucher.approvalStatus === "approved"
                ? "It is approved: deleting it reverses its entries, so the balance goes back."
                : "It has not moved any money."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <FormAlert message={fieldForCode(remove.error, {}).message} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(voucher.id, {
                  onSuccess: () => {
                    setDeleting(false);
                    router.push(pettyCashPath(projectId));
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
