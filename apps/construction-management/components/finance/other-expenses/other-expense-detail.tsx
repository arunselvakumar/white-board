"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
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

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { FinanceDocumentActivity } from "@/components/finance/documents/finance-document-activity";
import { formatDate, money } from "@/components/payments/payment-format";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  otherExpenseQuery,
  otherExpensesPath,
  useOtherExpenseCommand,
} from "@/src/queries/finance-other-expenses";

import { ExpenseStatusBadge, modeText } from "./other-expense-parts";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * One Other Expense (CM-704): its figures, status and decision, the
 * actions the viewer may take (Approve, Reject, Edit, Delete), then its
 * files and remarks.
 */
export function OtherExpenseDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: expense } = useSuspenseQuery(otherExpenseQuery(id));
  const access = useQuery(financeAccessQuery(projectId));
  const command = useOtherExpenseCommand();
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { actions } = expense;
  const canFiles =
    access.data != null &&
    (canInFinance(access.data, "finance.other_expenses", "create") ||
      canInFinance(access.data, "finance.other_expenses", "update"));

  const buttons = (
    <div className="flex flex-wrap gap-2">
      {actions.approve && (
        <Button
          type="button"
          size="sm"
          disabled={command.isPending}
          onClick={() => {
            setError(undefined);
            command.mutate(
              {
                kind: "approve",
                id: expense.id,
                expectedUpdatedAt: expense.updatedAt,
              },
              {
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
                },
              },
            );
          }}
        >
          Approve
        </Button>
      )}
      {actions.reject && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setError(undefined);
            setRejecting(true);
          }}
        >
          Reject
        </Button>
      )}
      {actions.edit && (
        <Link
          href={otherExpensesPath(projectId, `/${expense.id}/edit`)}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          Edit
        </Link>
      )}
      {actions.delete && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            setError(undefined);
            setDeleting(true);
          }}
        >
          Delete
        </Button>
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        back={{ label: "Other Expenses", href: otherExpensesPath(projectId) }}
        title={expense.number}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ExpenseStatusBadge status={expense.status} />
            {formatDate(expense.expenseDate)} · {money(expense.amount)}
          </span>
        }
        actions={buttons}
      />
      <FormAlert message={error} />
      {expense.status === "rejected" && expense.rejectReason != null && (
        <p className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
          Rejected by {expense.decidedBy?.name ?? "someone"}:{" "}
          {expense.rejectReason}. Edit it to send it for approval again.
        </p>
      )}
      {expense.status === "pending" && (
        <p className="text-muted-foreground text-sm">
          Pending approval: it moves no money until it is approved.
        </p>
      )}
      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Amount">{money(expense.amount)}</Fact>
        <Fact label="Payment Category">{expense.paymentCategory.name}</Fact>
        <Fact label="Paid to">{expense.payeeName ?? "—"}</Fact>
        <Fact label="Paid from">{expense.account.name}</Fact>
        <Fact label="Mode">{modeText(expense)}</Fact>
        <Fact label="Date">{formatDate(expense.expenseDate)}</Fact>
        <Fact label="Recorded by">{expense.createdBy.name}</Fact>
        {expense.status === "approved" && (
          <Fact label="Approved by">{expense.decidedBy?.name ?? "—"}</Fact>
        )}
        <div className="min-w-0 space-y-0.5 sm:col-span-2 lg:col-span-3">
          <dt className="text-muted-foreground text-xs">Description</dt>
          <dd className="text-sm break-words whitespace-pre-line">
            {expense.description ?? "—"}
          </dd>
        </div>
      </dl>
      <FinanceDocumentActivity
        documentType="other_expense"
        documentId={expense.id}
        canEdit={canFiles}
      />
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${expense.number}?`}
        description="The person who recorded it sees the reason and can edit it, which sends it back for approval."
        action="Reject"
        onSubmit={async (reason) => {
          try {
            await command.mutateAsync({
              kind: "reject",
              id: expense.id,
              reason,
              expectedUpdatedAt: expense.updatedAt,
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
            <AlertDialogTitle>Delete {expense.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {expense.status === "approved"
                ? `${money(expense.amount)} goes back into ${expense.account.name}. `
                : ""}
              Its number is not used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                command.mutate(
                  {
                    kind: "delete",
                    id: expense.id,
                    expectedUpdatedAt: expense.updatedAt,
                  },
                  {
                    onSuccess: () => {
                      setDeleting(false);
                      router.push(otherExpensesPath(projectId));
                    },
                    onError: (failure) => {
                      setDeleting(false);
                      setError(fieldForCode(failure, {}).message);
                    },
                  },
                );
              }}
            >
              {command.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
