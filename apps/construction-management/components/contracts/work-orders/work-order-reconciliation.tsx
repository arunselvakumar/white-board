"use client";

import { useQuery } from "@tanstack/react-query";
import { FileDown, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { ScrollTable } from "@/components/procurement/purchase-requests/scroll-table";
import { BILL_STATUS_LABELS } from "@/src/contracts/domain/contract-terms";
import {
  reconciliationPdfUrl,
  reconciliationQuery,
  useAssignIssueToWorkOrder,
  type Reconciliation,
  type ReconciliationMaterial,
} from "@/src/queries/contracts-reconciliation";

import { dateText, moneyOrDash, percentText } from "./work-order-format";

const DEFAULT = "default";

/** `"634.000"` → `"634"`, `"53.320"` → `"53.32"`. */
function quantityText(value: string): string {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function billLabel(bill: Reconciliation["bills"][number]): string {
  if (bill.number == null) return `Draft bill of ${dateText(bill.billDate)}`;
  const ra = bill.ordinal == null ? "" : ` · RA ${String(bill.ordinal)}`;
  const status =
    bill.status === "approved" ? "" : ` · ${BILL_STATUS_LABELS[bill.status]}`;
  return `${bill.number}${ra}${status}`;
}

/**
 * The recovery column: what the bill took when it is approved, else what
 * it suggests (the draft being prepared is the next bill).
 */
function recoveryText(
  row: ReconciliationMaterial,
  approved: boolean,
): { text: string; note: string } {
  if (row.penalRate == null && row.excessValue == null)
    return { text: "—", note: "" };
  if (approved)
    return {
      text: moneyOrDash(row.onThisBill ?? 0),
      note: "recovered on this bill",
    };
  return {
    text: moneyOrDash(row.recoverySuggested),
    note:
      row.onThisBill == null
        ? "suggested"
        : `suggested · ${moneyOrDash(row.onThisBill)} on the bill`,
  };
}

function UnderUse({ row }: { row: ReconciliationMaterial }) {
  if (!row.underUse) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700">
      <TriangleAlert aria-hidden="true" />
      Under-used
    </Badge>
  );
}

function MaterialsTable({
  statement,
  approved,
}: {
  statement: Reconciliation;
  approved: boolean;
}) {
  return (
    <ScrollTable label="Materials reconciled" className="hidden md:block">
      <TableHeader>
        <TableRow>
          <TableHead>Material</TableHead>
          <TableHead className="text-right">Theoretical</TableHead>
          <TableHead className="text-right">Allowed</TableHead>
          <TableHead className="text-right">Issued</TableHead>
          <TableHead className="text-right">Excess</TableHead>
          <TableHead>Under-use</TableHead>
          <TableHead className="text-right">Penal rate</TableHead>
          <TableHead className="text-right">Recovery</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {statement.materials.map((row) => {
          const recovery = recoveryText(row, approved);
          return (
            <TableRow key={row.materialId}>
              <TableCell className="min-w-40">
                <p className="font-medium">{row.materialName}</p>
                <p className="text-muted-foreground text-xs">
                  {row.uomName} · wastage {percentText(row.wastagePercent)}
                  {row.issueBasis === "at_cost" ? " · at cost" : ""}
                </p>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {quantityText(row.theoretical)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {quantityText(row.allowed)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {quantityText(row.netIssued)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {quantityText(row.excess)}
              </TableCell>
              <TableCell>
                <UnderUse row={row} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {moneyOrDash(row.penalRate)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <p className="font-medium">{recovery.text}</p>
                {recovery.note === "" ? null : (
                  <p className="text-muted-foreground text-xs">
                    {recovery.note}
                  </p>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </ScrollTable>
  );
}

function MaterialCards({
  statement,
  approved,
}: {
  statement: Reconciliation;
  approved: boolean;
}) {
  return (
    <ul aria-label="Materials reconciled" className="space-y-2 md:hidden">
      {statement.materials.map((row) => {
        const recovery = recoveryText(row, approved);
        return (
          <li
            key={row.materialId}
            className="min-w-0 space-y-2 rounded-lg border p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{row.materialName}</p>
                <p className="text-muted-foreground text-xs">
                  {row.uomName} · wastage {percentText(row.wastagePercent)}
                </p>
              </div>
              <UnderUse row={row} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              {(
                [
                  ["Theoretical", quantityText(row.theoretical)],
                  ["Allowed", quantityText(row.allowed)],
                  ["Issued", quantityText(row.netIssued)],
                  ["Excess", quantityText(row.excess)],
                  ["Penal rate", moneyOrDash(row.penalRate)],
                  [
                    approved ? "Recovered" : "Recovery suggested",
                    recovery.text,
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

function Unattributed({ statement }: { statement: Reconciliation }) {
  const assign = useAssignIssueToWorkOrder();
  const [error, setError] = useState<string | undefined>();
  if (statement.unattributed.length === 0) return null;
  const name = (materialId: string) =>
    statement.materials.find((row) => row.materialId === materialId)
      ?.materialName ?? "Material";
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-sm font-semibold">Unattributed issues</h4>
      <p className="text-muted-foreground text-xs">
        Delivered to {statement.workOrder.contractorName} without a Work Order,
        and none or several of its Work Orders list the material. They count
        nowhere until assigned.
      </p>
      <FormAlert message={error} />
      <ul aria-label="Unattributed issues" className="space-y-2">
        {statement.unattributed.map((row) => (
          <li
            key={row.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium break-words">
                {name(row.materialId)} · {quantityText(row.quantity)}
              </p>
              <p className="text-muted-foreground text-xs break-words">
                {row.deliveryNoteNumber} · {row.materialRequestNumber} ·
                delivered {dateText(row.date)}
              </p>
            </div>
            {statement.canAssign ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={assign.isPending}
                aria-label={`Assign ${row.deliveryNoteNumber} to this Work Order`}
                onClick={() => {
                  setError(undefined);
                  assign.mutate(
                    {
                      materialRequestId: row.materialRequestId,
                      workOrderId: statement.workOrder.id,
                    },
                    {
                      onError: (cause) => {
                        setError(cause.message);
                      },
                    },
                  );
                }}
              >
                Assign to this Work Order
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Work Order's material reconciliation (CM-1110, ADR CM-0023 §10): a
 * bill picker (the latest approved bill by default) and per material the
 * theoretical, allowed and issued quantities, the excess, an under-use
 * flag, the penal rate and the recovery suggested (a draft or pending
 * bill) or recovered (an approved one); then the issues no rule
 * attributes, with "Assign to this Work Order" for Material Request
 * editors, and the statement PDF. Cards at phone width.
 */
export function WorkOrderReconciliation({
  workOrderId,
  initialBillId = null,
  canPrint,
}: {
  workOrderId: string;
  initialBillId?: string | null;
  canPrint: boolean;
}) {
  const [billId, setBillId] = useState<string | null>(initialBillId);
  const query = useQuery(reconciliationQuery(workOrderId, billId));
  const statement = query.data;
  const bill = statement?.bill ?? null;
  const approved = bill?.status === "approved";
  return (
    <section
      id="reconciliation"
      aria-labelledby="wo-reconciliation-title"
      className="min-w-0 scroll-mt-20 space-y-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="wo-reconciliation-title" className="font-semibold">
            Material reconciliation
          </h3>
          <p className="text-muted-foreground text-sm">
            Cumulative to the bill: issues up to its &ldquo;measured up
            to&rdquo; date.
          </p>
        </div>
        {statement != null && canPrint ? (
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={reconciliationPdfUrl(workOrderId, bill?.id ?? null)}
          >
            <FileDown aria-hidden="true" />
            Statement PDF
          </a>
        ) : null}
      </div>
      {statement == null ? (
        query.isError ? (
          <FormAlert message={query.error.message} />
        ) : (
          <SkeletonGroup label="Loading material reconciliation">
            <SkeletonText width="80%" />
            <SkeletonText width="60%" />
          </SkeletonGroup>
        )
      ) : (
        <>
          {statement.bills.length > 0 ? (
            <div className="max-w-sm min-w-0 space-y-1.5">
              <Label htmlFor="reconciliation-bill">Bill</Label>
              <Select
                items={statement.bills.map((row) => ({
                  value: row.id,
                  label: billLabel(row),
                }))}
                value={bill?.id ?? DEFAULT}
                onValueChange={(value) => {
                  if (value != null && value !== DEFAULT) setBillId(value);
                }}
              >
                <SelectTrigger
                  id="reconciliation-bill"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" aria-label="Bills">
                  {statement.bills.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {billLabel(row)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bill == null ? null : (
                <p className="text-muted-foreground text-xs">
                  Bill of {dateText(bill.billDate)} · measured up to{" "}
                  {dateText(bill.measuredUpTo)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No running bill yet: the statement is to date.
            </p>
          )}
          {statement.materials.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This Work Order issues no materials.
            </p>
          ) : (
            <>
              <MaterialsTable statement={statement} approved={approved} />
              <MaterialCards statement={statement} approved={approved} />
              {statement.financial ? null : (
                <p className="text-muted-foreground text-xs">
                  Rates and recoveries need the Work Order&apos;s Financial
                  permission.
                </p>
              )}
              {statement.returnsRecorded ? null : (
                <p className="text-muted-foreground text-xs">
                  Returns from the Contractor are not recorded yet, so issued is
                  what was delivered.
                </p>
              )}
            </>
          )}
          <Unattributed statement={statement} />
        </>
      )}
    </section>
  );
}
