"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FormAlert } from "@/components/auth/form-alert";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import {
  formatPaise,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { DEDUCTION_KIND_LABELS } from "@/src/contracts/domain/contract-terms";
import { clientBillsPath } from "@/src/queries/contracts-client-bills";
import { contractorBillsPath } from "@/src/queries/contracts-contractor-bills";
import {
  escalationBillPdfUrl,
  escalationBillQuery,
  useEscalationBillCommand,
  type EscalationBill,
  type EscalationBillCommand,
  type EscalationComponentWorking,
} from "@/src/queries/contracts-escalation";

import { ReasonDialog } from "../work-orders/work-order-dialogs";
import {
  BillStatusBadge,
  billNumber,
  dateText,
  ESCALATION_COMPONENT_LABELS,
  factorText,
  indexText,
  monthText,
  percentText,
  periodText,
  signedMoney,
} from "./escalation-format";

const money = (paise: number | null) => signedMoney(paise, formatPaise);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function weightText(row: EscalationComponentWorking): string {
  if (row.basis === "quantity")
    return `${row.quantity ?? "0"} × ${money(row.basePrice)}`;
  return percentText(row.weightPercent);
}

/**
 * The working: one card per component at phone width, a table from md up
 * (component, weight, series, I₀, each month, Ī, factor, amount).
 */
export function EscalationWorkingTable({ bill }: { bill: EscalationBill }) {
  const { working } = bill;
  return (
    <section
      aria-labelledby="escalation-working-title"
      className="min-w-0 space-y-3"
    >
      <h2 id="escalation-working-title" className="font-semibold">
        Working (10CC / 10CA)
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="R: value of work">{money(working.valueOfWork)}</Fact>
        <Fact label="Non-escalable">
          {percentText(working.nonEscalablePercent)}
        </Fact>
        <Fact label="Base month">{monthText(working.baseMonth)}</Fact>
        {working.quantityValue !== 0 ? (
          <Fact label="R for 10CC (less 10CA materials)">
            {money(working.escalableValue)}
          </Fact>
        ) : null}
      </dl>
      <ul aria-label="Components" className="space-y-2 md:hidden">
        {working.components.map((row) => (
          <li
            key={row.component}
            className="min-w-0 rounded-md border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {ESCALATION_COMPONENT_LABELS[row.component]}{" "}
                <span className="text-muted-foreground font-normal">
                  {weightText(row)}
                </span>
              </p>
              <p className="font-semibold tabular-nums">{money(row.amount)}</p>
            </div>
            <p className="text-muted-foreground text-xs break-words">
              {row.series}
            </p>
            <p className="mt-1 text-xs">
              I₀ {indexText(row.baseIndex)} → Ī {indexText(row.averageIndex)} (
              {factorText(row.factor)})
            </p>
            <p className="text-muted-foreground text-xs">
              {row.indices
                .map(
                  (item) => `${monthText(item.month)} ${indexText(item.value)}`,
                )
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table aria-label="Working" className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Component</th>
              <th className="p-2 text-right">Weight</th>
              <th className="p-2">Series</th>
              <th className="p-2 text-right">I₀</th>
              {working.months.map((month) => (
                <th key={month} className="p-2 text-right">
                  {monthText(month)}
                </th>
              ))}
              <th className="p-2 text-right">Ī</th>
              <th className="p-2 text-right">Factor</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {working.components.map((row) => (
              <tr key={row.component} className="border-t">
                <td className="p-2">
                  {ESCALATION_COMPONENT_LABELS[row.component]}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {weightText(row)}
                </td>
                <td className="p-2">{row.series}</td>
                <td className="p-2 text-right tabular-nums">
                  {indexText(row.baseIndex)}
                </td>
                {row.indices.map((item) => (
                  <td key={item.month} className="p-2 text-right tabular-nums">
                    {indexText(item.value)}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums">
                  {indexText(row.averageIndex)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {factorText(row.factor)}
                </td>
                <td className="p-2 text-right font-medium tabular-nums">
                  {money(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer">
          {working.bills.length} running{" "}
          {working.bills.length === 1 ? "bill" : "bills"} in R
        </summary>
        <ul aria-label="Running bills in R" className="mt-2 space-y-1">
          {working.bills.map((row) => (
            <li key={row.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {billNumber(row.number)} · {dateText(row.billDate)}
              </span>
              <span className="tabular-nums">{money(row.gross)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

type DeductionRow = {
  kind: "retention" | "other";
  amount: string;
  description: string;
};

/** A draft's period, bill date, 10CA quantities, deductions and remarks. */
function DraftEditor({
  bill,
  pending,
  onSave,
}: {
  bill: EscalationBill;
  pending: boolean;
  onSave: (command: EscalationBillCommand) => void;
}) {
  const [fromMonth, setFromMonth] = useState(bill.periodFrom.slice(0, 7));
  const [toMonth, setToMonth] = useState(bill.periodTo.slice(0, 7));
  const [billDate, setBillDate] = useState(bill.billDate);
  const [remarks, setRemarks] = useState(bill.remarks ?? "");
  const quantityRows = bill.working.components.filter(
    (row) => row.basis === "quantity",
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      quantityRows.map((row) => [row.component, row.quantity ?? ""]),
    ),
  );
  const [deductions, setDeductions] = useState<DeductionRow[]>(
    bill.deductionLines.map((row) => ({
      kind: row.kind === "retention" ? "retention" : "other",
      amount: paiseToRupees(row.amount),
      description: row.description ?? "",
    })),
  );
  return (
    <form
      noValidate
      aria-label="Escalation bill details"
      className="min-w-0 space-y-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          kind: "update",
          input: {
            billDate,
            fromMonth,
            toMonth,
            remarks: remarks.trim() === "" ? null : remarks,
            ...(quantityRows.length > 0
              ? {
                  quantities: quantityRows.map((row) => ({
                    component: row.component,
                    quantity: quantities[row.component] ?? "0",
                  })),
                }
              : {}),
            ...(bill.financial
              ? {
                  deductions: deductions.map((row) => ({
                    kind: row.kind,
                    amount: rupeesToPaise(row.amount) ?? 0,
                    description:
                      row.description.trim() === "" ? null : row.description,
                  })),
                }
              : {}),
            expectedUpdatedAt: bill.updatedAt,
          },
        });
      }}
    >
      <h2 className="font-semibold">Bill details</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="escalation-edit-from" required>
            From month
          </Label>
          <Input
            id="escalation-edit-from"
            aria-required
            type="month"
            value={fromMonth}
            onChange={(event) => {
              setFromMonth(event.currentTarget.value);
            }}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="escalation-edit-to" required>
            To month
          </Label>
          <Input
            id="escalation-edit-to"
            aria-required
            type="month"
            value={toMonth}
            onChange={(event) => {
              setToMonth(event.currentTarget.value);
            }}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="escalation-edit-date" required>
            Bill date
          </Label>
          <Input
            id="escalation-edit-date"
            aria-required
            type="date"
            value={billDate}
            onChange={(event) => {
              setBillDate(event.currentTarget.value);
            }}
          />
        </div>
      </div>
      {quantityRows.length > 0 ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {quantityRows.map((row) => (
            <div key={row.component} className="min-w-0 space-y-1.5">
              <Label htmlFor={`escalation-quantity-${row.component}`} required>
                {ESCALATION_COMPONENT_LABELS[row.component]} used in the period
                (10CA)
              </Label>
              <Input
                id={`escalation-quantity-${row.component}`}
                aria-required
                inputMode="decimal"
                value={quantities[row.component] ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setQuantities((current) => ({
                    ...current,
                    [row.component]: value,
                  }));
                }}
              />
              <p className="text-muted-foreground text-xs">
                Typed for now; material reconciliation will fill it.
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {bill.financial ? (
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Deductions</h3>
            <span className="text-muted-foreground text-xs">
              Retention at most {money(bill.retention.suggested)}
            </span>
          </div>
          <ul className="space-y-2">
            {deductions.map((row, index) => (
              <li
                key={index}
                className="grid min-w-0 gap-2 sm:grid-cols-[8rem_10rem_minmax(0,1fr)_auto]"
              >
                <span className="self-center text-sm">
                  {DEDUCTION_KIND_LABELS[row.kind]}
                </span>
                <MoneyInput
                  aria-label={`${DEDUCTION_KIND_LABELS[row.kind]} amount`}
                  value={row.amount}
                  onChange={(event) => {
                    const amount = event.currentTarget.value;
                    setDeductions((current) =>
                      current.map((item, at) =>
                        at === index ? { ...item, amount } : item,
                      ),
                    );
                  }}
                />
                <Input
                  aria-label="Reason"
                  placeholder={
                    row.kind === "other" ? "What it is for" : "Note (optional)"
                  }
                  value={row.description}
                  onChange={(event) => {
                    const description = event.currentTarget.value;
                    setDeductions((current) =>
                      current.map((item, at) =>
                        at === index ? { ...item, description } : item,
                      ),
                    );
                  }}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove deduction"
                  onClick={() => {
                    setDeductions((current) =>
                      current.filter((_, at) => at !== index),
                    );
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={(bill.retention.suggested ?? 0) <= 0}
              onClick={() => {
                setDeductions((current) => [
                  ...current.filter((row) => row.kind !== "retention"),
                  {
                    kind: "retention",
                    amount: paiseToRupees(bill.retention.suggested),
                    description: "",
                  },
                ]);
              }}
            >
              Use suggested retention
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDeductions((current) => [
                  ...current,
                  { kind: "other", amount: "", description: "" },
                ]);
              }}
            >
              <Plus aria-hidden="true" />
              Add deduction
            </Button>
          </div>
        </div>
      ) : null}
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="escalation-edit-remarks">Remarks</Label>
        <Textarea
          id="escalation-edit-remarks"
          value={remarks}
          onChange={(event) => {
            setRemarks(event.currentTarget.value);
          }}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save and work out again"}
      </Button>
    </form>
  );
}

/**
 * One escalation bill (CM-1109): status and actions by `allowed`, the
 * period and party, the working table, GST, deductions and net, and —
 * when the indices fell — what the running bills still have to recover.
 */
export function EscalationBillDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: bill } = useSuspenseQuery(escalationBillQuery(id));
  const command = useEscalationBillCommand(id);
  const [dialog, setDialog] = useState<"reject" | "reverse" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const client = bill.side === "client";
  const listPath = client
    ? clientBillsPath(projectId)
    : contractorBillsPath(projectId);
  const number = billNumber(bill.number);
  const { allowed } = bill;
  const stamp = { expectedUpdatedAt: bill.updatedAt };
  const run = (next: EscalationBillCommand, after?: () => void) => {
    setError(undefined);
    command.mutate(next, {
      onSuccess: () => {
        setDialog(null);
        after?.();
      },
      onError: (failure) => {
        setError(fieldForCode(failure, {}).message);
      },
    });
  };
  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{
          label: client ? "Client Bills" : "Contractor Bills",
          href: listPath,
        }}
        title={`Escalation Bill ${number}`}
        size="detail"
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <BillStatusBadge status={bill.status} />
            {bill.ordinal == null ? null : (
              <Badge variant="outline">Escalation {bill.ordinal}</Badge>
            )}
            <span>{bill.partyName}</span>
          </span>
        }
        actions={
          <>
            {allowed.print ? (
              <a
                href={escalationBillPdfUrl(id)}
                download
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download aria-hidden="true" />
                Download PDF
              </a>
            ) : null}
            {allowed.refresh ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={command.isPending}
                onClick={() => {
                  run({ kind: "refresh", ...stamp });
                }}
              >
                <RefreshCw aria-hidden="true" />
                Work out again
              </Button>
            ) : null}
            {allowed.submit ? (
              <Button
                type="button"
                size="sm"
                disabled={command.isPending}
                onClick={() => {
                  run({ kind: "submit", ...stamp });
                }}
              >
                <Send aria-hidden="true" />
                Submit for approval
              </Button>
            ) : null}
            {allowed.reject ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("reject");
                }}
              >
                Reject
              </Button>
            ) : null}
            {allowed.approve ? (
              <Button
                type="button"
                size="sm"
                disabled={command.isPending}
                onClick={() => {
                  run({ kind: "approve", ...stamp });
                }}
              >
                Approve
              </Button>
            ) : null}
            {allowed.reverse ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("reverse");
                }}
              >
                Reverse
              </Button>
            ) : null}
            {allowed.delete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={command.isPending}
                onClick={() => {
                  run({ kind: "delete", ...stamp }, () => {
                    router.push(listPath);
                  });
                }}
              >
                Delete draft
              </Button>
            ) : null}
          </>
        }
      />
      <FormAlert message={dialog == null ? error : undefined} />
      {bill.rejectReason != null && bill.status === "rejected" ? (
        <Alert>
          <AlertDescription>Rejected: {bill.rejectReason}</AlertDescription>
        </Alert>
      ) : null}
      {bill.reverseReason != null ? (
        <Alert>
          <AlertDescription>Reversed: {bill.reverseReason}</AlertDescription>
        </Alert>
      ) : null}
      {bill.warnings.map((warning) => (
        <Alert key={warning.code + warning.message}>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-4">
        <Fact label="Period">{periodText(bill.periodFrom, bill.periodTo)}</Fact>
        <Fact label="Bill date">{dateText(bill.billDate)}</Fact>
        <Fact label={client ? "Client" : "Contractor"}>{bill.partyName}</Fact>
        <Fact label={client ? "Contract" : "Work Order"}>
          {client
            ? "Client contract"
            : billNumber(bill.workOrder?.number ?? null)}
        </Fact>
      </dl>
      <EscalationWorkingTable bill={bill} />
      {bill.financial ? (
        <section
          aria-labelledby="escalation-net-title"
          className="min-w-0 space-y-2 rounded-lg border p-4"
        >
          <h2 id="escalation-net-title" className="font-semibold">
            GST, deductions and net
          </h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt>Escalation (gross)</dt>
              <dd className="tabular-nums">{money(bill.gross)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>
                GST {percentText(bill.gstRate)}
                {bill.reverseCharge
                  ? " (reverse charge: paid by the Company)"
                  : ""}
              </dt>
              <dd className="tabular-nums">{money(bill.gst)}</dd>
            </div>
            {bill.deductionLines.map((row) => (
              <div key={row.id} className="flex justify-between gap-2">
                <dt className="min-w-0 break-words">
                  {DEDUCTION_KIND_LABELS[row.kind]}
                  {row.description == null ? "" : ` (${row.description})`}
                </dt>
                <dd className="tabular-nums">− {money(row.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
              <dt>{client ? "Net receivable" : "Net payable"}</dt>
              <dd className="tabular-nums">{money(bill.net)}</dd>
            </div>
          </dl>
          {(bill.gross ?? 0) < 0 ? (
            <p className="text-muted-foreground text-sm">
              The indices fell, so this escalation comes back: it is deducted on
              the next running bills as an escalation recovery. No invoice is
              raised for it.
            </p>
          ) : null}
          {bill.recovery != null ? (
            <p className="text-sm">
              Recovered {money(bill.recovery.recovered)} of{" "}
              {money(bill.recovery.amount)}; {money(bill.recovery.outstanding)}{" "}
              left.
            </p>
          ) : null}
        </section>
      ) : null}
      {allowed.edit ? (
        <DraftEditor
          key={bill.updatedAt}
          bill={bill}
          pending={command.isPending}
          onSave={(next) => {
            run(next);
          }}
        />
      ) : bill.remarks != null ? (
        <p className="text-sm whitespace-pre-line">{bill.remarks}</p>
      ) : null}
      {dialog === "reject" ? (
        <ReasonDialog
          title={`Reject Escalation Bill ${number}?`}
          description="The bill stays as a record with your reason."
          empty="Write why it is rejected."
          confirm="Reject"
          busyLabel="Rejecting…"
          destructive
          pending={command.isPending}
          error={error}
          onConfirm={(reason) => {
            run({ kind: "reject", reason, ...stamp });
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "reverse" ? (
        <ReasonDialog
          title={`Reverse Escalation Bill ${number}?`}
          description="Its invoice is reversed in finance. Only the latest approved escalation bill, with nothing paid against it and no running bill recovering it, can be reversed."
          empty="Write why it is reversed."
          confirm="Reverse bill"
          busyLabel="Reversing…"
          destructive
          pending={command.isPending}
          error={error}
          onConfirm={(reason) => {
            run({ kind: "reverse", reason, ...stamp });
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
