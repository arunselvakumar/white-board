"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, Download, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { DEDUCTION_KIND_LABELS } from "@/src/contracts/domain/contract-terms";
import {
  contractorBillPdfUrl,
  contractorBillQuery,
  contractorBillsPath,
  useContractorBillCommand,
  type ContractorBill,
  type ContractorBillCommand,
  type ContractorBillLine,
} from "@/src/queries/contracts-contractor-bills";
import { workOrdersPath } from "@/src/queries/contracts-work-orders";
import { QueryHttpError } from "@/src/queries/http";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";

import { ReasonDialog } from "../work-orders/work-order-dialogs";
import { ContractorBillEditor } from "./contractor-bill-editor";
import {
  BillStatusBadge,
  billNumber,
  dateText,
  moneyOrDash,
  percentText,
  quantity,
  raLabel,
  rowWorking,
  whenText,
} from "./contractor-bill-format";

type Dialog = "reject" | "reverse" | "delete" | "final" | null;

type ShortLine = {
  lineId: string;
  itemNo: string | null;
  billed: string;
  workOrderQuantity: string;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** The rows behind one line of the abstract, as cards that never scroll sideways. */
function MeasurementRows({ line }: { line: ContractorBillLine }) {
  return (
    <ul
      aria-label={`Measurements of ${line.itemNo ?? line.description}`}
      className="space-y-2"
    >
      {line.rows.map((row) => (
        <li
          key={row.id}
          className="grid min-w-0 gap-1 rounded-md border p-2 text-xs sm:grid-cols-[6rem_1fr_auto] sm:items-baseline sm:gap-3"
        >
          <span className="text-muted-foreground whitespace-nowrap">
            {dateText(row.measuredOn)}
          </span>
          <span className="min-w-0 break-words">
            {row.description ?? row.sheetTitle ?? "—"}
            {row.locationLabel == null ? null : (
              <span className="text-muted-foreground block">
                {row.locationLabel}
              </span>
            )}
          </span>
          <span className="tabular-nums sm:text-right">
            <span className="text-muted-foreground">{rowWorking(row)} = </span>
            {quantity(row.quantity)} {line.uomName}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One line of the abstract: previous / this / cumulative, the amount, and its rows. */
function AbstractLine({
  line,
  financial,
}: {
  line: ContractorBillLine;
  financial: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label =
    line.itemNo == null
      ? line.description
      : `${line.itemNo} · ${line.description}`;
  return (
    <li className="min-w-0 rounded-lg border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="space-y-2 p-3">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <p className="min-w-0 font-medium break-words">{label}</p>
            {financial ? (
              <p className="text-sm font-semibold tabular-nums">
                {moneyOrDash(line.amount)}
              </p>
            ) : null}
          </div>
          <dl className="grid min-w-0 grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Fact label="Previous">
              {quantity(line.previousQuantity)} {line.uomName}
            </Fact>
            <Fact label="This bill">
              {quantity(line.quantity)} {line.uomName}
            </Fact>
            <Fact label="Cumulative">
              {quantity(line.cumulativeQuantity)}
              {line.workOrderQuantity == null
                ? ""
                : ` of ${quantity(line.workOrderQuantity)}`}{" "}
              {line.uomName}
            </Fact>
            {financial ? (
              <Fact label="Rate">
                {moneyOrDash(line.rate)} / {line.uomName}
              </Fact>
            ) : null}
          </dl>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 h-auto px-2 py-1"
              />
            }
          >
            {open ? "Hide" : "Show"} {line.rows.length}{" "}
            {line.rows.length === 1 ? "measurement" : "measurements"}
            <ChevronDown
              aria-hidden="true"
              className={
                open
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="px-3 pb-3">
          <MeasurementRows line={line} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function Summary({ bill }: { bill: ContractorBill }) {
  const gst = (bill.cgst ?? 0) + (bill.sgst ?? 0) + (bill.igst ?? 0);
  const rows: [string, string, boolean?][] = [
    ["Value to date", moneyOrDash(bill.cumulativeValue)],
    ["Less previous bills", `− ${moneyOrDash(bill.previousValue)}`],
    ["Gross this bill", moneyOrDash(bill.gross), true],
    ...(bill.supplyType === "inter_state"
      ? ([[`IGST ${percentText(bill.gstRate)}`, moneyOrDash(bill.igst)]] as [
          string,
          string,
        ][])
      : ([
          ["CGST", moneyOrDash(bill.cgst)],
          ["SGST", moneyOrDash(bill.sgst)],
        ] as [string, string][])),
    ...(bill.reverseCharge && gst > 0
      ? ([
          [
            "GST under reverse charge (the Company pays it)",
            `− ${moneyOrDash(gst)}`,
          ],
        ] as [string, string][])
      : []),
    ...bill.deductionLines.map(
      (deduction) =>
        [
          `${DEDUCTION_KIND_LABELS[deduction.kind]}${deduction.description == null ? "" : ` (${deduction.description})`}`,
          `− ${moneyOrDash(deduction.amount)}`,
        ] as [string, string],
    ),
    ["Net payable", moneyOrDash(bill.net), true],
  ];
  return (
    <section
      aria-labelledby="bill-summary-title"
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <h3 id="bill-summary-title" className="font-semibold">
        GST and net
      </h3>
      <p className="text-muted-foreground text-xs">
        GST {percentText(bill.gstRate)}
        {bill.sacCode == null ? "" : ` on SAC ${bill.sacCode}`} ·{" "}
        {bill.supplyType === "inter_state"
          ? "Inter-state (IGST)"
          : "Intra-state (CGST + SGST)"}
        {bill.placeOfSupplyStateCode == null
          ? ""
          : ` · Place of supply ${bill.placeOfSupplyStateCode}`}
        {bill.reverseCharge ? " · Reverse charge" : ""}
      </p>
      <dl className="space-y-1 text-sm">
        {rows.map(([label, value, strong]) => (
          <div
            key={label}
            className="flex min-w-0 flex-wrap justify-between gap-x-3"
          >
            <dt className={strong === true ? "font-semibold" : undefined}>
              {label}
            </dt>
            <dd
              className={`tabular-nums ${strong === true ? "font-semibold" : ""}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {bill.tdsEstimate == null ? null : (
        <p className="text-muted-foreground text-xs" role="note">
          {bill.tdsEstimate.applicable
            ? `TDS estimate (${bill.tdsEstimate.label}) at ${percentText(bill.tdsEstimate.rate)} of ${moneyOrDash(bill.tdsEstimate.base)}: about ${moneyOrDash(bill.tdsEstimate.amount)}. `
            : "No TDS: the Contractor's TDS settings say it does not apply. "}
          {bill.tdsEstimate.note}
        </p>
      )}
      {bill.retentionHeldOnWorkOrder == null ? null : (
        <p className="text-sm">
          Retention held on this Work Order:{" "}
          <span className="font-semibold tabular-nums">
            {moneyOrDash(bill.retentionHeldOnWorkOrder)}
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * One Contractor Bill (CM-1106): its status and actions by what the
 * viewer may do (refresh, submit, approve, reject, reverse, delete,
 * Download PDF), the reject or reverse reason, the bill's facts, the
 * abstract with the measurements behind each line, the draft's details
 * and deductions editor, GST and net, the TDS estimate, and the finance
 * invoice once approved.
 */
export function ContractorBillDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: bill } = useSuspenseQuery(contractorBillQuery(id));
  const command = useContractorBillCommand(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | undefined>();
  const [short, setShort] = useState<ShortLine[]>([]);
  const number = billNumber(bill.number);
  const ra = raLabel(bill);
  const { allowed, financial } = bill;
  const stamp = { expectedUpdatedAt: bill.updatedAt };
  const run = (next: ContractorBillCommand, after?: () => void) => {
    setError(undefined);
    command.mutate(next, {
      onSuccess: () => {
        setDialog(null);
        after?.();
      },
      onError: (failure) => {
        if (
          failure instanceof QueryHttpError &&
          failure.code === "BILL_FINAL_UNBILLED"
        ) {
          const details = failure.details as { lines?: ShortLine[] } | null;
          setShort(details?.lines ?? []);
          setDialog("final");
          return;
        }
        setError(fieldForCode(failure, {}).message);
      },
    });
  };
  const more = allowed.delete || allowed.reverse;
  const draft = bill.status === "draft";

  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{
          label: "Contractor Bills",
          href: contractorBillsPath(projectId),
        }}
        title={`Contractor Bill ${number}`}
        size="detail"
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <BillStatusBadge status={bill.status} />
            {ra === "" ? null : <Badge variant="outline">{ra}</Badge>}
            <span>{bill.contractorName}</span>
          </span>
        }
        actions={
          <>
            {allowed.print ? (
              <a
                href={contractorBillPdfUrl(id)}
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
                Refresh measurements
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
                  setError(undefined);
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
            {more ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button type="button" size="sm" variant="outline" />}
                >
                  More
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {allowed.reverse ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setError(undefined);
                        setDialog("reverse");
                      }}
                    >
                      Reverse bill
                    </DropdownMenuItem>
                  ) : null}
                  {allowed.delete ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setError(undefined);
                        setDialog("delete");
                      }}
                    >
                      Delete draft
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />
      <FormAlert message={dialog == null ? error : undefined} />

      {bill.status === "rejected" ? (
        <Alert variant="destructive">
          <AlertTitle>
            Rejected
            {bill.decidedByName == null ? "" : ` by ${bill.decidedByName}`}
          </AlertTitle>
          <AlertDescription>
            {bill.rejectReason} Its measurements are free for the next bill.
          </AlertDescription>
        </Alert>
      ) : null}
      {bill.status === "reversed" ? (
        <Alert variant="destructive">
          <AlertTitle>
            Reversed
            {bill.reversedAt == null ? "" : ` ${whenText(bill.reversedAt)}`}
            {bill.reversedByName == null ? "" : ` by ${bill.reversedByName}`}
          </AlertTitle>
          <AlertDescription>
            {bill.reverseReason} Its invoice was reversed in finance and its
            measurements are free again.
          </AlertDescription>
        </Alert>
      ) : null}
      {bill.status === "approved" && bill.invoiceId != null ? (
        <Alert>
          <AlertTitle>Invoice {number} in Payments</AlertTitle>
          <AlertDescription>
            Approving created a payable invoice of {moneyOrDash(bill.net)} for{" "}
            {bill.contractorName}. It is read-only there: reverse the bill to
            change it.{" "}
            <Link
              href={`/app/projects/${projectId}/payments/contractors/${bill.contractorId}`}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              Open {bill.contractorName}&apos;s invoices
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="Contractor Bill"
        className="min-w-0 rounded-xl border p-4"
      >
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Contractor">{bill.contractorName}</Fact>
          <Fact label="Work Order">
            <Link
              href={workOrdersPath(projectId, bill.workOrderId)}
              className="underline-offset-4 hover:underline"
            >
              {bill.workOrder.number ?? "Draft"}
            </Link>
            {bill.departmentName == null ? "" : ` · ${bill.departmentName}`}
          </Fact>
          <Fact label="Bill date">{dateText(bill.billDate)}</Fact>
          <Fact label="Measured up to">{dateText(bill.measuredUpTo)}</Fact>
          <Fact label="Drafted by">
            {bill.createdByName ?? "—"} · {whenText(bill.createdAt)}
          </Fact>
          {bill.submittedAt == null ? null : (
            <Fact label="Submitted by">
              {bill.submittedByName ?? "—"} · {whenText(bill.submittedAt)}
            </Fact>
          )}
          {bill.decidedAt == null ||
          bill.status === "pending_approval" ? null : (
            <Fact
              label={bill.status === "rejected" ? "Rejected by" : "Approved by"}
            >
              {bill.decidedByName ?? "—"} · {whenText(bill.decidedAt)}
            </Fact>
          )}
          {financial ? (
            <Fact label="Net payable">{moneyOrDash(bill.net)}</Fact>
          ) : null}
        </dl>
        {!draft && bill.remarks != null ? (
          <p className="mt-3 text-sm break-words whitespace-pre-line">
            {bill.remarks}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="bill-abstract-title"
        className="min-w-0 space-y-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="bill-abstract-title" className="font-semibold">
            Abstract
          </h3>
          {financial ? (
            <p className="text-sm font-semibold tabular-nums">
              Gross {moneyOrDash(bill.gross)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Rates and amounts need the Contractor Bill&apos;s Financial
              permission.
            </p>
          )}
        </div>
        <ul aria-label="Abstract" className="space-y-2">
          {bill.lines.map((line) => (
            <AbstractLine key={line.id} line={line} financial={financial} />
          ))}
        </ul>
      </section>

      {draft && allowed.edit ? <ContractorBillEditor bill={bill} /> : null}
      {financial ? <Summary bill={bill} /> : null}
      {!financial && bill.deductionLines.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          Deductions:{" "}
          {bill.deductionLines
            .map((deduction) => DEDUCTION_KIND_LABELS[deduction.kind])
            .join(", ")}
        </p>
      ) : null}

      {dialog === "reject" ? (
        <ReasonDialog
          title={`Reject Contractor Bill ${number}?`}
          description="The bill stays as a record with your reason. Its measurements are freed, so the next bill takes them."
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
          title={`Reverse Contractor Bill ${number}?`}
          description={
            bill.isFinal
              ? "Its invoice is reversed in finance, its measurements are freed, and the Work Order it closed is issued again. Only the latest bill, with nothing paid against it, can be reversed."
              : "Its invoice is reversed in finance and its measurements are freed. Only the latest bill, with nothing paid against it, can be reversed."
          }
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
      <AlertDialog
        open={dialog === "final"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close the Work Order short?</AlertDialogTitle>
            <AlertDialogDescription>
              This is the Final bill, and these Work Order lines are not fully
              billed. Approving closes the Work Order anyway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-sm">
            {short.map((line) => (
              <li key={line.lineId} className="flex justify-between gap-3">
                <span>Line {line.itemNo ?? "—"}</span>
                <span className="tabular-nums">
                  {quantity(line.billed)} of {quantity(line.workOrderQuantity)}
                </span>
              </li>
            ))}
          </ul>
          <FormAlert message={dialog === "final" ? error : undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <Button
              type="button"
              disabled={command.isPending}
              onClick={() => {
                run({ kind: "approve", confirmUnbilled: true, ...stamp });
              }}
            >
              {command.isPending ? "Approving…" : "Approve and close"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft bill to {bill.contractorName} is removed and its
              measurements are free for the next bill.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={dialog === "delete" ? error : undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                run({ kind: "delete", ...stamp }, () => {
                  router.push(contractorBillsPath(projectId));
                });
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
