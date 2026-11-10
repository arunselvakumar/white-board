"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  otherExpenseQuery,
  otherExpensesPath,
} from "@/src/queries/finance-other-expenses";

import { OtherExpenseForm } from "./other-expense-form";

/** Record an Other Expense (CM-704). */
export function OtherExpenseNew({
  projectId,
  today,
}: {
  projectId: string;
  today?: string;
}) {
  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        back={{ label: "Other Expenses", href: otherExpensesPath(projectId) }}
        title="Add Other Expense"
      />
      <OtherExpenseForm projectId={projectId} expense={null} today={today} />
    </div>
  );
}

/** Edit an Other Expense (CM-704). */
export function OtherExpenseEdit({
  projectId,
  id,
  today,
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const { data } = useSuspenseQuery(otherExpenseQuery(id));
  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        back={{
          label: data.number,
          href: otherExpensesPath(projectId, `/${id}`),
        }}
        title={`Edit ${data.number}`}
      />
      <OtherExpenseForm
        key={data.updatedAt}
        projectId={projectId}
        expense={data}
        today={today}
      />
    </div>
  );
}
