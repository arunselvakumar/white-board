"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { COUNTERPARTY_KIND_LABELS } from "@/components/finance/counterparty-field";
import { FinanceDocumentActivity } from "@/components/finance/documents/finance-document-activity";
import { formatPaise } from "@/components/money/money-input";
import { formatDate, localToday } from "@/components/payments/payment-format";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  transactionQuery,
  transferQuery,
  type RegisterItem,
} from "@/src/queries/finance-transactions";

import { TransactionActions } from "./transaction-actions";
import { TransactionDialog } from "./transaction-form";
import {
  ApprovalChip,
  DIRECTION_LABELS,
  MODE_LABELS,
  transactionsPath,
} from "./transaction-format";
import { TransferDialog } from "./transfer-form";

const ACCOUNT_KIND = {
  cash: "Cash",
  bank: "Bank",
  petty_cash: "Petty cash",
} as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function accountText(account: {
  name: string | null;
  kind: keyof typeof ACCOUNT_KIND | null;
}): string {
  if (account.name == null) return "—";
  return account.kind == null
    ? account.name
    : `${account.name} (${ACCOUNT_KIND[account.kind]})`;
}

function Fields({ item }: { item: RegisterItem }) {
  const decided =
    item.decidedAt == null
      ? null
      : `${item.decidedByName ?? "—"} on ${formatDate(item.decidedAt.slice(0, 10))}`;
  if (item.type === "transfer")
    return (
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date">{formatDate(item.transferDate)}</Field>
        <Field label="Amount">{formatPaise(item.amount)}</Field>
        <Field label="Mode">
          {MODE_LABELS[item.mode]}
          {item.reference == null ? "" : ` · ${item.reference}`}
        </Field>
        <Field label="From account">{accountText(item.fromAccount)}</Field>
        <Field label="To account">{accountText(item.toAccount)}</Field>
        <Field label="Project">{item.projectName ?? "Company"}</Field>
        <Field label="Description">{item.description ?? "—"}</Field>
        <Field label="Recorded by">
          {item.createdByName ?? "—"} on{" "}
          {formatDate(item.createdAt.slice(0, 10))}
        </Field>
        {decided != null ? (
          <Field
            label={
              item.approvalStatus === "rejected" ? "Rejected by" : "Approved by"
            }
          >
            {decided}
          </Field>
        ) : null}
      </dl>
    );
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Date">{formatDate(item.transactionDate)}</Field>
      <Field label="Type">{DIRECTION_LABELS[item.direction]}</Field>
      <Field label="Amount">{formatPaise(item.amount)}</Field>
      <Field
        label={item.direction === "payment_in" ? "Received into" : "Paid from"}
      >
        {accountText(item.account)}
      </Field>
      <Field label="Mode">
        {MODE_LABELS[item.mode]}
        {item.chequeNumber != null
          ? ` · Cheque ${item.chequeNumber}${item.modeDate == null ? "" : ` dated ${formatDate(item.modeDate)}`}`
          : item.reference != null
            ? ` · ${item.reference}`
            : ""}
      </Field>
      <Field label="Payment Category">{item.paymentCategoryName ?? "—"}</Field>
      <Field
        label={item.direction === "payment_in" ? "Received From" : "Paid To"}
      >
        {item.counterparty == null
          ? "—"
          : item.counterparty.kind == null
            ? item.counterparty.name
            : `${item.counterparty.name} (${COUNTERPARTY_KIND_LABELS[item.counterparty.kind]})`}
      </Field>
      <Field label="Project or Store">
        {item.projectName ?? item.storeName ?? "Company"}
      </Field>
      <Field label="Description">{item.description ?? "—"}</Field>
      <Field label="Recorded by">
        {item.createdByName ?? "—"} on {formatDate(item.createdAt.slice(0, 10))}
        {item.importBatchId == null ? "" : " (imported)"}
      </Field>
      {decided != null ? (
        <Field
          label={
            item.approvalStatus === "rejected" ? "Rejected by" : "Approved by"
          }
        >
          {decided}
        </Field>
      ) : null}
    </dl>
  );
}

/**
 * One Transaction or transfer (CM-702): its fields, status and reject
 * reason, and Approve / Reject / Edit / Delete as the viewer's flags allow.
 */
export function TransactionDetail({
  projectId,
  document,
  id,
  today = localToday(),
}: {
  projectId: string;
  document: "transaction" | "transfer";
  id: string;
  today?: string;
}) {
  return document === "transaction" ? (
    <LoadedTransaction projectId={projectId} id={id} today={today} />
  ) : (
    <LoadedTransfer projectId={projectId} id={id} today={today} />
  );
}

type Loaded = { projectId: string; id: string; today: string };

function LoadedTransaction({ projectId, id, today }: Loaded) {
  const { data } = useSuspenseQuery(transactionQuery(id));
  return <DetailBody projectId={projectId} item={data} today={today} />;
}

function LoadedTransfer({ projectId, id, today }: Loaded) {
  const { data } = useSuspenseQuery(transferQuery(id));
  return <DetailBody projectId={projectId} item={data} today={today} />;
}

function DetailBody({
  projectId,
  item,
  today,
}: {
  projectId: string;
  item: RegisterItem;
  today: string;
}) {
  const router = useRouter();
  const access = useQuery(financeAccessQuery(projectId)).data;
  const canApprove =
    access != null && canInFinance(access, "finance.transactions", "approve");
  const canAttach =
    access != null &&
    (canInFinance(access, "finance.transactions", "create") ||
      canInFinance(access, "finance.transactions", "update"));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const back = { label: "Transactions", href: transactionsPath(projectId) };
  return (
    <div className="space-y-5">
      <PageHeader
        back={back}
        title={item.number}
        meta={
          item.type === "transaction"
            ? DIRECTION_LABELS[item.direction]
            : "Transfer between accounts"
        }
        actions={<ApprovalChip status={item.approvalStatus} />}
      />
      {item.approvalStatus === "rejected" && item.rejectReason != null ? (
        <p className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
          <span className="font-medium">Rejected:</span> {item.rejectReason}.
          Edit it to send it for approval again.
        </p>
      ) : null}
      {item.approvalStatus === "pending" ? (
        <p className="text-muted-foreground text-sm">
          Waiting for approval: it moves no money until it is approved.
        </p>
      ) : null}
      <TransactionActions
        projectId={projectId}
        item={item}
        variant="buttons"
        onError={setError}
        onEdit={() => {
          setEditing(true);
        }}
        onDeleted={() => {
          router.push(back.href);
        }}
      />
      <FormAlert message={error} />
      <div className="bg-card rounded-xl border p-4">
        <Fields item={item} />
      </div>
      <FinanceDocumentActivity
        documentType={
          item.type === "transaction" ? "transaction" : "account_transfer"
        }
        documentId={item.id}
        canEdit={canAttach}
      />
      {editing && item.type === "transaction" ? (
        <TransactionDialog
          projectId={projectId}
          transaction={item}
          canApprove={canApprove}
          today={today}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      {editing && item.type === "transfer" ? (
        <TransferDialog
          projectId={projectId}
          transfer={item}
          canApprove={canApprove}
          today={today}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}
