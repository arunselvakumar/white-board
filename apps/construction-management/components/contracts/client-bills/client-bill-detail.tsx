"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
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
  clientBillPdfUrl,
  clientBillQuery,
  clientBillsPath,
  useClientBillCommand,
  type ClientBill,
  type ClientBillCommand,
  type ClientBillLine,
} from "@/src/queries/contracts-client-bills";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";

import { ReasonDialog } from "../work-orders/work-order-dialogs";
import { ClientBillEditor } from "./client-bill-editor";
import {
  BillStatusBadge,
  billNumber,
  dateText,
  moneyOrDash,
  percentText,
  quantity,
  raLabel,
  rowWorking,
  stateText,
  whenText,
} from "./client-bill-format";

type Dialog = "reject" | "reverse" | "delete" | null;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** The rows behind one line of the abstract, as cards that never scroll sideways. */
function MeasurementRows({ line }: { line: ClientBillLine }) {
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
  line: ClientBillLine;
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
            <p className="min-w-0 font-medium break-words">
              {label}
              {line.deviation.over ? (
                <Badge
                  variant={line.deviation.overLimit ? "destructive" : "outline"}
                  className="ml-2 align-middle"
                >
                  Deviation
                </Badge>
              ) : null}
            </p>
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
              {line.boqQuantity == null
                ? ""
                : ` of BOQ ${quantity(line.boqQuantity)}`}{" "}
              {line.uomName}
            </Fact>
            {financial ? (
              <Fact label="Rate">
                {moneyOrDash(line.rate)} / {line.uomName}
              </Fact>
            ) : null}
          </dl>
          {line.deviation.over ? (
            <p className="text-xs" role="note">
              Billed {quantity(line.deviation.overBy)} {line.uomName} past the
              BOQ
              {line.deviation.percentOver == null
                ? ""
                : ` (${percentText(line.deviation.percentOver)} over)`}
              .{" "}
              {line.deviation.overLimit
                ? "Beyond the deviation limit: the item needs a Variation."
                : "Within the deviation limit."}
            </p>
          ) : null}
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

function Summary({ bill }: { bill: ClientBill }) {
  const gst = (bill.cgst ?? 0) + (bill.sgst ?? 0) + (bill.igst ?? 0);
  const half =
    bill.gstRate == null ? null : (Number(bill.gstRate) / 2).toFixed(2);
  const rows: [string, string, boolean?][] = [
    ["Value to date", moneyOrDash(bill.cumulativeValue)],
    ["Less previous bills", `− ${moneyOrDash(bill.previousValue)}`],
    ["Taxable value this bill", moneyOrDash(bill.gross), true],
    ...(gst === 0
      ? []
      : bill.supplyType === "inter_state"
        ? ([[`IGST ${percentText(bill.gstRate)}`, moneyOrDash(bill.igst)]] as [
            string,
            string,
          ][])
        : ([
            [`CGST ${percentText(half)}`, moneyOrDash(bill.cgst)],
            [`SGST ${percentText(half)}`, moneyOrDash(bill.sgst)],
          ] as [string, string][])),
    [
      "Invoice value",
      moneyOrDash(bill.gross == null ? null : bill.gross + gst),
      true,
    ],
    ...bill.deductionLines.map(
      (deduction) =>
        [
          `${DEDUCTION_KIND_LABELS[deduction.kind]}${deduction.description == null ? "" : ` (${deduction.description})`}`,
          `− ${moneyOrDash(deduction.amount)}`,
        ] as [string, string],
    ),
    ["Net receivable", moneyOrDash(bill.net), true],
  ];
  return (
    <section
      aria-labelledby="client-bill-summary-title"
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <h3 id="client-bill-summary-title" className="font-semibold">
        GST and net receivable
      </h3>
      <p className="text-muted-foreground text-xs">
        GST {bill.gstRate == null ? "none" : percentText(bill.gstRate)}
        {bill.sacCode == null ? "" : ` on SAC ${bill.sacCode}`} ·{" "}
        {bill.supplyType === "inter_state"
          ? "Inter-state (IGST)"
          : "Intra-state (CGST + SGST)"}{" "}
        · Place of supply {stateText(bill.placeOfSupply)} · No reverse charge
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
      <p className="text-muted-foreground text-xs" role="note">
        The Client may deduct TDS and, as a government body, GST-TDS when it
        pays: record them on its receipt in Payments.
      </p>
      {bill.retentionReceivable == null ? null : (
        <p className="text-sm">
          Retention receivable on this Project:{" "}
          <span className="font-semibold tabular-nums">
            {moneyOrDash(bill.retentionReceivable)}
          </span>
        </p>
      )}
    </section>
  );
}

/** The tax invoice's parties: supplier and recipient with their GSTINs. */
function Parties({ bill }: { bill: ClientBill }) {
  return (
    <section
      aria-label="Tax invoice"
      className="grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2"
    >
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">Supplier</h3>
        <p className="text-sm break-words">
          {bill.supplier?.address ?? "No billing address on the Company"}
        </p>
        <p className="text-sm">
          GSTIN{" "}
          <span className="font-medium">
            {bill.supplierGstin ?? "Not registered"}
          </span>
          {bill.supplier == null ? "" : ` · ${stateText(bill.supplier)}`}
        </p>
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">Recipient (Client)</h3>
        <p className="text-sm font-medium break-words">
          {bill.recipient?.name ?? bill.clientName}
        </p>
        {bill.recipient?.address == null ? null : (
          <p className="text-sm break-words">
            {bill.recipient.address}
            {bill.recipient.pinCode == null
              ? ""
              : ` – ${bill.recipient.pinCode}`}
          </p>
        )}
        <p className="text-sm">
          GSTIN{" "}
          <span className="font-medium">
            {bill.recipientGstin ?? "Unregistered"}
          </span>
          {bill.recipient == null ? "" : ` · ${stateText(bill.recipient)}`}
        </p>
      </div>
      <p className="text-muted-foreground text-xs sm:col-span-2">
        Place of supply {stateText(bill.placeOfSupply)}: the Project&apos;s
        state, as works on immovable property.
        {bill.sacCode == null ? "" : ` SAC ${bill.sacCode}.`}
      </p>
    </section>
  );
}

/**
 * One Client Bill (CM-1107): its status and actions by what the viewer may
 * do (refresh, submit, approve, reject, reverse, delete, Download PDF), the
 * reject or reverse reason, the GSTIN_NOT_IN_STATE warning, the tax
 * invoice's parties and place of supply, the abstract against the BOQ with
 * deviation marks and the measurements behind each line, the draft's
 * details and deductions editor, GST and the net receivable, and the
 * finance invoice once approved.
 */
export function ClientBillDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: bill } = useSuspenseQuery(clientBillQuery(id));
  const command = useClientBillCommand(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | undefined>();
  const number = billNumber(bill.number);
  const ra = raLabel(bill);
  const { allowed, financial } = bill;
  const stamp = { expectedUpdatedAt: bill.updatedAt };
  const run = (next: ClientBillCommand, after?: () => void) => {
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
  const more = allowed.delete || allowed.reverse;
  const draft = bill.status === "draft";

  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{
          label: "Client Bills",
          href: clientBillsPath(projectId),
        }}
        title={`Client Bill ${number}`}
        size="detail"
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <BillStatusBadge status={bill.status} />
            {ra === "" ? null : <Badge variant="outline">{ra}</Badge>}
            <span>{bill.clientName}</span>
          </span>
        }
        actions={
          <>
            {allowed.print ? (
              <a
                href={clientBillPdfUrl(id)}
                download
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download aria-hidden="true" />
                Tax invoice PDF
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

      {bill.warnings.map((warning) => (
        <Alert key={warning.code}>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>No Company GSTIN in this state</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}

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
            {bill.reverseReason} Its invoice to the Client was reversed in
            finance and its measurements are free again.
          </AlertDescription>
        </Alert>
      ) : null}
      {bill.status === "approved" && bill.invoiceId != null ? (
        <Alert>
          <AlertTitle>Invoice {number} in Payments</AlertTitle>
          <AlertDescription>
            Approving created a receivable invoice of {moneyOrDash(bill.net)} to{" "}
            {bill.clientName}. It is read-only there: reverse the bill to change
            it. Record the Client&apos;s receipts, with any TDS and GST-TDS it
            deducts, against it.{" "}
            <Link
              href={`/app/projects/${projectId}/payments/clients/${bill.clientId}`}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              Open {bill.clientName}&apos;s invoices
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="Client Bill"
        className="min-w-0 rounded-xl border p-4"
      >
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Client">{bill.clientName}</Fact>
          <Fact label="Place of supply">{stateText(bill.placeOfSupply)}</Fact>
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
            <Fact label="Net receivable">{moneyOrDash(bill.net)}</Fact>
          ) : null}
        </dl>
        {!draft && bill.remarks != null ? (
          <p className="mt-3 text-sm break-words whitespace-pre-line">
            {bill.remarks}
          </p>
        ) : null}
      </section>

      <Parties bill={bill} />

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
              Rates and amounts need the Client Bill&apos;s Financial
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

      {draft && allowed.edit ? <ClientBillEditor bill={bill} /> : null}
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
          title={`Reject Client Bill ${number}?`}
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
          title={`Reverse Client Bill ${number}?`}
          description="Its invoice to the Client is reversed in finance and its measurements are freed. Only the latest Client Bill, with nothing received against it, can be reversed."
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
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft bill to {bill.clientName} is removed and its
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
                  router.push(clientBillsPath(projectId));
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
