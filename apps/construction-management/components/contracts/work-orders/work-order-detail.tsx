"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  FilePen,
  Pencil,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { ScrollTable } from "@/components/procurement/purchase-requests/scroll-table";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { fieldForCode } from "@/lib/server-errors";
import {
  ISSUE_BASIS_LABELS,
  TDS_NATURE_LABELS,
} from "@/src/contracts/domain/contract-terms";
import { workOrderActions } from "@/src/contracts/domain/work-order";
import {
  useWorkOrderCommand,
  workOrderPdfUrl,
  workOrderQuery,
  workOrdersPath,
  type WorkOrder,
  type WorkOrderCommand,
  type WorkOrderRevision,
} from "@/src/queries/contracts-work-orders";

import { CloseWorkOrderDialog, ReasonDialog } from "./work-order-dialogs";
import { localToday } from "./work-order-form";
import {
  dateText,
  moneyOrDash,
  percentText,
  quantity,
  whenText,
  WorkOrderStatusBadge,
  workOrderNumber,
} from "./work-order-format";

type Dialog = "reject" | "close" | "cancel" | "delete" | null;

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

type TermsView = WorkOrder["terms"];

function TermsFacts({
  terms,
  financial,
}: {
  terms: TermsView;
  financial: boolean;
}) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
      <Fact label="Retention per bill">
        {percentText(terms.retentionPercent)}
      </Fact>
      <Fact label="Retention cap">
        {terms.retentionCapPercent == null
          ? "No cap"
          : `${percentText(terms.retentionCapPercent)} of value`}
      </Fact>
      <Fact label="Released on completion">
        {percentText(terms.retentionCompletionPercent)}
      </Fact>
      <Fact label="DLP">
        {terms.dlpMonths == null ? "—" : `${String(terms.dlpMonths)} months`}
      </Fact>
      {financial ? (
        <Fact label="Mobilisation advance">
          {moneyOrDash(terms.mobilisationAdvance)}
        </Fact>
      ) : null}
      <Fact label="Advance recovery per bill">
        {percentText(terms.mobilisationRecoveryPercent)}
      </Fact>
      <Fact label="TDS nature">
        {terms.tdsNature == null
          ? "No TDS"
          : TDS_NATURE_LABELS[terms.tdsNature]}
      </Fact>
      <Fact label="SAC">{terms.sacCode ?? "—"}</Fact>
      <Fact label="GST">
        {percentText(terms.gstRate)}
        {terms.reverseCharge ? " · Reverse charge" : ""}
      </Fact>
    </dl>
  );
}

type LineView = {
  id: string;
  itemNo: string | null;
  description: string;
  uomName: string;
  quantity: string;
  rate: number | null;
  amount: number | null;
  billed?: string;
};

/** The lines in a table that scrolls inside its frame. */
function LinesTable({
  lines,
  financial,
  label,
}: {
  lines: readonly LineView[];
  financial: boolean;
  label: string;
}) {
  const billed = lines.some(
    (line) => line.billed != null && line.billed !== "0.0000",
  );
  return (
    <ScrollTable label={label} className="[&>table]:min-w-[36rem]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Item no</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          {billed ? <TableHead className="text-right">Billed</TableHead> : null}
          {financial ? (
            <>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id} className="align-top">
            <TableCell className="whitespace-nowrap">
              {line.itemNo ?? "—"}
            </TableCell>
            <TableCell className="max-w-96 whitespace-normal">
              {line.description}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums">
              {quantity(line.quantity)} {line.uomName}
            </TableCell>
            {billed ? (
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {line.billed == null ? "—" : quantity(line.billed)}
              </TableCell>
            ) : null}
            {financial ? (
              <>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(line.rate)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(line.amount)}
                </TableCell>
              </>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </ScrollTable>
  );
}

function RevisionItem({
  revision,
  financial,
}: {
  revision: WorkOrderRevision;
  financial: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { snapshot } = revision;
  return (
    <li className="min-w-0 rounded-lg border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-3 py-2 text-left"
            />
          }
        >
          <span className="min-w-0 whitespace-normal">
            <span className="block font-medium">
              Revision {String(revision.revision)}
            </span>
            <span className="text-muted-foreground block text-xs font-normal">
              Amended {whenText(revision.createdAt)}
              {revision.createdByName == null
                ? ""
                : ` by ${revision.createdByName}`}
              {revision.reason == null ? "" : `: ${revision.reason}`}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={
              open ? "rotate-180 transition-transform" : "transition-transform"
            }
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 px-3 pb-3">
          <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
            <Fact label="Order date">{dateText(snapshot.orderDate)}</Fact>
            <Fact label="Valid until">{dateText(snapshot.validUntil)}</Fact>
            {financial ? (
              <Fact label="Value">{moneyOrDash(snapshot.value)}</Fact>
            ) : null}
          </dl>
          <TermsFacts terms={snapshot.terms} financial={financial} />
          <LinesTable
            lines={snapshot.lines}
            financial={financial}
            label={`Revision ${String(revision.revision)} lines`}
          />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/**
 * One Work Order (CM-1104): its status and actions by the viewer's flags
 * (edit, submit, approve, reject, amend, close, cancel, delete, Download
 * PDF), BOQ warnings, the Contractor and dates, the terms, the lines, the
 * materials issued, and the earlier revisions, each opening to its terms
 * and lines.
 */
export function WorkOrderDetail({
  projectId,
  id,
  today = localToday(),
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const router = useRouter();
  const { data: workOrder } = useSuspenseQuery(workOrderQuery(id));
  const command = useWorkOrderCommand(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | undefined>();
  const flags = workOrder.viewerFlags;
  const allowed = workOrderActions(workOrder.status);
  const number = workOrderNumber(workOrder.number);
  const financial = workOrder.financial;
  const editor = flags.includes("update") || flags.includes("create");
  const can = {
    edit: allowed.edit && editor,
    submit: allowed.submit && editor,
    approve: allowed.approve && flags.includes("approve"),
    reject: allowed.reject && flags.includes("reject"),
    amend:
      allowed.amend && flags.includes("update") && flags.includes("approve"),
    close: allowed.close && flags.includes("update"),
    cancel: allowed.cancel && flags.includes("update"),
    delete:
      allowed.delete && (flags.includes("delete") || flags.includes("create")),
    print: flags.includes("print"),
  };
  const run = (next: WorkOrderCommand, after?: () => void) => {
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
  const stamp = { expectedUpdatedAt: workOrder.updatedAt };
  const more = can.close || can.cancel || can.delete;

  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{ label: "Work Orders", href: workOrdersPath(projectId) }}
        title={`Work Order ${number}`}
        size="detail"
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <WorkOrderStatusBadge status={workOrder.status} />
            {workOrder.revision > 0 ? (
              <Badge variant="outline">
                Revision {String(workOrder.revision)}
              </Badge>
            ) : null}
            <span>{workOrder.contractorName}</span>
          </span>
        }
        actions={
          <>
            {can.print ? (
              <a
                href={workOrderPdfUrl(id)}
                download
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download aria-hidden="true" />
                Download PDF
              </a>
            ) : null}
            {can.edit ? (
              <Link
                href={workOrdersPath(projectId, id, "edit")}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            ) : null}
            {can.amend ? (
              <Link
                href={workOrdersPath(projectId, id, "amend")}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <FilePen aria-hidden="true" />
                Amend
              </Link>
            ) : null}
            {can.submit ? (
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
            {can.reject ? (
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
            {can.approve ? (
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
                  {can.close ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setError(undefined);
                        setDialog("close");
                      }}
                    >
                      Close
                    </DropdownMenuItem>
                  ) : null}
                  {can.cancel ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setError(undefined);
                        setDialog("cancel");
                      }}
                    >
                      Cancel Work Order
                    </DropdownMenuItem>
                  ) : null}
                  {can.delete ? (
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

      {workOrder.status === "draft" && workOrder.rejectReason != null ? (
        <Alert variant="destructive">
          <AlertTitle>
            Rejected
            {workOrder.decidedByName == null
              ? ""
              : ` by ${workOrder.decidedByName}`}
          </AlertTitle>
          <AlertDescription>{workOrder.rejectReason}</AlertDescription>
        </Alert>
      ) : null}
      {workOrder.status === "cancelled" ? (
        <Alert variant="destructive">
          <AlertTitle>Cancelled {dateText(workOrder.cancelledOn)}</AlertTitle>
          <AlertDescription>{workOrder.cancelReason}</AlertDescription>
        </Alert>
      ) : null}
      {workOrder.status === "closed" ? (
        <Alert>
          <AlertTitle>Closed {dateText(workOrder.closedOn)}</AlertTitle>
          <AlertDescription>{workOrder.closeReason}</AlertDescription>
        </Alert>
      ) : null}
      {workOrder.warnings.length > 0 ? (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>More than the BOQ has left</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {workOrder.warnings.map((warning) => (
                <li key={warning.boqItemId}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="Work Order"
        className="min-w-0 rounded-xl border p-4"
      >
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Contractor">{workOrder.contractorName}</Fact>
          <Fact label="Department">{workOrder.departmentName ?? "—"}</Fact>
          <Fact label="Order date">{dateText(workOrder.orderDate)}</Fact>
          <Fact label="Valid until">{dateText(workOrder.validUntil)}</Fact>
          {financial ? (
            <Fact label="Value (excl. GST)">
              {moneyOrDash(workOrder.value)}
            </Fact>
          ) : null}
          <Fact label="Raised by">
            {workOrder.createdByName ?? "—"} · {whenText(workOrder.createdAt)}
          </Fact>
          {workOrder.decidedAt != null && workOrder.status !== "draft" ? (
            <Fact label="Approved by">
              {workOrder.decidedByName ?? "—"} · {whenText(workOrder.decidedAt)}
            </Fact>
          ) : null}
        </dl>
        {workOrder.scope == null ? null : (
          <div className="mt-3 min-w-0">
            <p className="text-muted-foreground text-xs">Scope</p>
            <p className="text-sm break-words whitespace-pre-line">
              {workOrder.scope}
            </p>
          </div>
        )}
      </section>

      <section
        aria-labelledby="wo-terms-title"
        className="min-w-0 space-y-3 rounded-xl border p-4"
      >
        <h3 id="wo-terms-title" className="font-semibold">
          Terms
        </h3>
        <TermsFacts terms={workOrder.terms} financial={financial} />
      </section>

      <section aria-labelledby="wo-lines-title" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="wo-lines-title" className="font-semibold">
            Lines
          </h3>
          {financial ? (
            <p className="text-sm font-semibold tabular-nums">
              Total {moneyOrDash(workOrder.value)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Rates and amounts need the Work Order&apos;s Financial permission.
            </p>
          )}
        </div>
        <LinesTable
          lines={workOrder.lines}
          financial={financial}
          label="Work Order lines"
        />
      </section>

      {workOrder.materials.length > 0 ? (
        <section
          aria-labelledby="wo-materials-title"
          className="min-w-0 space-y-3"
        >
          <h3 id="wo-materials-title" className="font-semibold">
            Materials issued
          </h3>
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
            {workOrder.materials.map((material) => (
              <li
                key={material.id}
                className="min-w-0 rounded-lg border p-3 text-sm"
              >
                <p className="font-medium break-words">
                  {material.materialName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {ISSUE_BASIS_LABELS[material.issueBasis]}
                  {financial && material.issueRate != null
                    ? ` at ${moneyOrDash(material.issueRate)}`
                    : ""}
                  {` · Wastage ${percentText(material.wastagePercent)}`}
                  {financial && material.penalRate != null
                    ? ` · Penal ${moneyOrDash(material.penalRate)}`
                    : ""}
                </p>
                <ul className="text-muted-foreground mt-1 text-xs">
                  {material.coefficients.map((entry) => {
                    const line = workOrder.lines.find(
                      (row) => row.id === entry.lineId,
                    );
                    return (
                      <li key={entry.lineId} className="break-words">
                        {line?.itemNo ?? line?.description ?? "Line"}:{" "}
                        {quantity(entry.coefficient)} {material.uomName} per{" "}
                        {line?.uomName ?? "unit"}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="wo-revisions-title"
        className="min-w-0 space-y-3"
      >
        <h3 id="wo-revisions-title" className="font-semibold">
          Revisions
        </h3>
        {workOrder.revisions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {workOrder.status === "issued"
              ? "No amendments yet. An amendment keeps this revision here."
              : "Earlier revisions show here once an issued Work Order is amended."}
          </p>
        ) : (
          <ul className="space-y-2">
            {workOrder.revisions.map((revision) => (
              <RevisionItem
                key={revision.id}
                revision={revision}
                financial={financial}
              />
            ))}
          </ul>
        )}
      </section>

      {dialog === "reject" ? (
        <ReasonDialog
          title={`Reject Work Order ${number}?`}
          description="It goes back to draft with your reason, keeping its number. Whoever raised it can change it and submit it again."
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
      {dialog === "cancel" ? (
        <ReasonDialog
          title={`Cancel Work Order ${number}?`}
          description="Its lines stop counting against the BOQ. A Work Order with approved bills cannot be cancelled; close it instead."
          empty="Write why it is cancelled."
          confirm="Cancel Work Order"
          busyLabel="Cancelling…"
          destructive
          pending={command.isPending}
          error={error}
          onConfirm={(reason) => {
            run({ kind: "cancel", reason, ...stamp });
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "close" ? (
        <CloseWorkOrderDialog
          number={number}
          orderDate={workOrder.orderDate}
          today={today < workOrder.orderDate ? workOrder.orderDate : today}
          pending={command.isPending}
          error={error}
          onConfirm={(input) => {
            run({ kind: "close", ...input, ...stamp });
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
              The draft Work Order to {workOrder.contractorName} is removed. A
              number it took is not given out again.
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
                  router.push(workOrdersPath(projectId));
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
