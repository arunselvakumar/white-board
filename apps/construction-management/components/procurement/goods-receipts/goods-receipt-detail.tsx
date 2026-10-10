"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { FileDown, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import {
  DocumentActivity,
  DocumentFiles,
} from "@/components/procurement/documents/document-activity";
import {
  goodsReceiptPdfUrl,
  goodsReceiptQuery,
  useDeleteGoodsReceipt,
  type GoodsReceipt,
} from "@/src/queries/goods-receipts";
import { QueryHttpError } from "@/src/queries/http";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

import { StockShortfallAlert, stockShortfalls } from "./goods-receipt-errors";
import {
  DELIVERY_FIELDS,
  formatDate,
  goodsReceivedPath,
  GRN_FIELD_LABELS,
  money,
  qty,
  SUPPLIER_FIELDS,
  SUPPLY_TYPE_LABELS,
  type GrnField,
} from "./goods-receipt-parts";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function detailValue(receipt: GoodsReceipt, field: GrnField): string | null {
  switch (field) {
    case "invoiceDate":
      return receipt.invoiceDate == null
        ? null
        : formatDate(receipt.invoiceDate);
    case "invoiceAmount":
      return receipt.invoiceAmount == null
        ? null
        : money(receipt.invoiceAmount);
    case "driverMobile":
      return receipt.driverMobile;
    default:
      return receipt[field];
  }
}

function Details({
  receipt,
  title,
  fields,
}: {
  receipt: GoodsReceipt;
  title: string;
  fields: readonly GrnField[];
}) {
  const hidden = new Set<string>(receipt.hiddenFields);
  const facts = fields
    .filter((field) => !hidden.has(field))
    .map((field) => ({
      field,
      value: detailValue(receipt, field),
    }))
    .filter(
      (fact): fact is { field: GrnField; value: string } => fact.value != null,
    );
  if (facts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <Fact
            key={fact.field}
            label={GRN_FIELD_LABELS[fact.field]}
            value={fact.value}
          />
        ))}
      </dl>
    </section>
  );
}

function Lines({ receipt }: { receipt: GoodsReceipt }) {
  const withOrder = receipt.purchaseOrder != null;
  return (
    <div
      role="region"
      aria-label="Materials received, scrolls sideways"
      tabIndex={0}
      className="focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [&>[data-slot=table-container]]:overflow-visible"
    >
      <Table aria-label="Materials received">
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>HSN</TableHead>
            {withOrder && <TableHead className="text-right">Ordered</TableHead>}
            {withOrder && (
              <TableHead className="text-right">Received earlier</TableHead>
            )}
            <TableHead className="text-right">Received</TableHead>
            {receipt.financial && (
              <TableHead className="text-right">Rate</TableHead>
            )}
            <TableHead className="text-right">GST</TableHead>
            {receipt.financial && (
              <TableHead className="text-right">Total</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipt.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="min-w-44">
                <span className="font-medium">{line.materialName}</span>
                {line.excessQty != null && (
                  <Badge variant="secondary" className="ml-2">
                    Excess received {qty(line.excessQty)}
                  </Badge>
                )}
              </TableCell>
              <TableCell>{line.hsnCode ?? "—"}</TableCell>
              {withOrder && (
                <TableCell className="text-right tabular-nums">
                  {qty(line.orderedQty)}
                </TableCell>
              )}
              {withOrder && (
                <TableCell className="text-right tabular-nums">
                  {qty(line.receivedElsewhereQty)}
                </TableCell>
              )}
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {qty(line.receivedQty)} {line.uomName}
              </TableCell>
              {receipt.financial && (
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {money(line.unitRate)}
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums">
                {qty(line.gstRate)}%
              </TableCell>
              {receipt.financial && (
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {money(line.total)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Totals({ receipt }: { receipt: GoodsReceipt }) {
  if (!receipt.financial) return null;
  const invoice = receipt.invoiceAmount;
  return (
    <div className="bg-muted/40 ml-auto w-full max-w-sm space-y-1.5 rounded-lg border p-4 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Taxable value</dt>
          <dd className="tabular-nums">{money(receipt.taxableTotal)}</dd>
        </div>
        {receipt.supplyType === "intra_state" ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">CGST</dt>
              <dd className="tabular-nums">{money(receipt.cgstTotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">SGST</dt>
              <dd className="tabular-nums">{money(receipt.sgstTotal)}</dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">IGST</dt>
            <dd className="tabular-nums">{money(receipt.igstTotal)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
          <dt>GRN value</dt>
          <dd className="tabular-nums">{money(receipt.totalValue)}</dd>
        </div>
      </dl>
      {invoice != null && invoice !== receipt.totalValue && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The invoice amount is {money(invoice)}, not the GRN value.
        </p>
      )}
    </div>
  );
}

/** One Goods Receipt (CM-505): lines, totals, details, remarks and files. */
export function GoodsReceiptDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: receipt } = useSuspenseQuery(goodsReceiptQuery(id));
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const can = (flag: "update" | "delete" | "print") =>
    access != null && canIn(access, "procurement.material_received", flag);
  const remove = useDeleteGoodsReceipt();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const shortfalls = stockShortfalls(failure);
  const message =
    failure == null || shortfalls != null
      ? undefined
      : failure instanceof QueryHttpError
        ? failure.message
        : "Something went wrong. Please try again.";

  const actions = (
    <div className="flex flex-wrap gap-2">
      {can("print") && (
        <a
          href={goodsReceiptPdfUrl(receipt.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          <FileDown aria-hidden="true" />
          PDF
        </a>
      )}
      {can("update") && !receipt.paid && (
        <Link
          href={goodsReceivedPath(projectId, `/${receipt.id}/edit`)}
          className={buttonVariants({ variant: "outline" })}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Link>
      )}
      {can("delete") && !receipt.paid && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFailure(null);
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      )}
    </div>
  );

  return (
    <div className="w-full space-y-8">
      <PageHeader
        back={{ label: "Goods Received", href: goodsReceivedPath(projectId) }}
        title={receipt.number}
        meta={
          <span className="text-muted-foreground text-sm">
            {receipt.supplier.name}
            {receipt.purchaseOrder == null
              ? " · Without PO"
              : ` · ${receipt.purchaseOrder.number}`}
          </span>
        }
        actions={actions}
      />
      {shortfalls != null && (
        <StockShortfallAlert shortfalls={shortfalls} action="delete" />
      )}
      <FormAlert message={message} />
      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact label="GR Date" value={formatDate(receipt.receiptDate)} />
        <Fact
          label="Inventory Date"
          value={formatDate(receipt.inventoryDate)}
        />
        <Fact label="Supplier" value={receipt.supplier.name} />
        <Fact
          label="Purchase Order"
          value={receipt.purchaseOrder?.number ?? "Without PO"}
        />
        <Fact label="GST" value={SUPPLY_TYPE_LABELS[receipt.supplyType]} />
        <Fact label="Received by" value={receipt.createdBy.name ?? "—"} />
      </dl>
      <section className="space-y-3">
        <h2 className="font-semibold">Materials received</h2>
        <Lines receipt={receipt} />
        <Totals receipt={receipt} />
      </section>
      <Details
        receipt={receipt}
        title="Supplier details"
        fields={SUPPLIER_FIELDS}
      />
      <Details
        receipt={receipt}
        title="Delivery details"
        fields={DELIVERY_FIELDS}
      />
      {receipt.remark != null && (
        <section className="space-y-2">
          <h2 className="font-semibold">Remark</h2>
          <p className="text-sm whitespace-pre-line">{receipt.remark}</p>
        </section>
      )}
      <DocumentActivity
        documentType="goods_receipt"
        documentId={receipt.id}
        heading="Remarks"
      />
      <DocumentFiles
        documentType="goods_receipt"
        documentId={receipt.id}
        canEdit={can("update")}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {receipt.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its stock is taken back out of the Project, and its Purchase Order
              counts these quantities as not received.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(
                  { id: receipt.id, expectedUpdatedAt: receipt.updatedAt },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                      router.push(goodsReceivedPath(projectId));
                    },
                    onError: (error) => {
                      setConfirming(false);
                      setFailure(error);
                    },
                  },
                );
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
