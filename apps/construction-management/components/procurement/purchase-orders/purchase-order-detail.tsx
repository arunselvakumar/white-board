"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { LocationLabel } from "@/components/locations/location-picker";
import { formatDate, money } from "@/components/payments/payment-format";
import {
  DocumentActivity,
  DocumentFiles,
} from "@/components/procurement/documents/document-activity";
import { quantityText } from "@/components/procurement/purchase-requests/purchase-request-format";
import { purchaseRequestsPath } from "@/components/procurement/purchase-requests/purchase-request-actions";
import { ScrollTable } from "@/components/procurement/purchase-requests/scroll-table";
import { formatMobile } from "@repo/auth/construction/react";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { purchaseOrderQuery } from "@/src/queries/purchase-orders";
import { gstStateName } from "@/src/shared-kernel/gst-states";

import { PurchaseOrderActions } from "./purchase-order-actions";
import {
  purchaseOrdersPath,
  RECEIPT_LABELS,
  ReceiptBadge,
  StageBadge,
  STAGE_LABELS,
} from "./purchase-order-format";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

const state = (code: string | null) =>
  code == null ? "—" : `${gstStateName(code) ?? code} (${code})`;

const contact = (poc: { name: string | null; mobile: string | null }) =>
  [poc.name, poc.mobile == null ? null : formatMobile(poc.mobile)]
    .filter((v) => v != null)
    .join(" · ") || "—";

/**
 * One Purchase Order (CM-504): stages, supplier and addresses, lines with
 * HSN and the GST split, totals, approval / ordered / closed info, the
 * linked Purchase Request and Goods Receipts, files and remarks.
 */
export function PurchaseOrderDetailPage({
  projectId,
  id,
  uploadFailed = 0,
}: {
  projectId: string;
  id: string;
  uploadFailed?: number;
}) {
  const router = useRouter();
  const { data: po } = useSuspenseQuery(purchaseOrderQuery(id));
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const [error, setError] = useState<string | undefined>(
    uploadFailed > 0
      ? `The order was saved, but ${String(uploadFailed)} ${uploadFailed === 1 ? "file" : "files"} did not upload. Add ${uploadFailed === 1 ? "it" : "them"} below.`
      : undefined,
  );
  const intra = po.supplyType === "intra_state";
  const canEditFiles =
    access != null && canIn(access, "procurement.purchase_orders", "update");
  const t = po.totals;
  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          href={purchaseOrdersPath(projectId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Purchase Orders
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{po.number}</h2>
            <div className="flex flex-wrap gap-1">
              <StageBadge stage={po.stage} />
              <ReceiptBadge po={po} />
            </div>
          </div>
          <PurchaseOrderActions
            po={po}
            projectId={projectId}
            variant="buttons"
            onError={setError}
            onDeleted={() => {
              router.push(purchaseOrdersPath(projectId));
            }}
          />
        </div>
        <FormAlert message={error} />
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Fact label="Purchase Order Date">{formatDate(po.orderDate)}</Fact>
        <Fact label="Expected Delivery Date">
          {formatDate(po.expectedDeliveryDate)}
        </Fact>
        <Fact label="Purchase Request">
          {po.purchaseRequest == null ? (
            "—"
          ) : (
            <Link
              href={purchaseRequestsPath(
                projectId,
                `/${po.purchaseRequest.id}`,
              )}
              className="text-primary hover:underline"
            >
              {po.purchaseRequest.number ?? "Purchase Request"}
            </Link>
          )}
        </Fact>
        <Fact label="Supplier">
          {po.supplier.name}
          <span className="text-muted-foreground block text-xs">
            {po.supplier.gstin == null
              ? "GSTIN not registered"
              : `GSTIN ${po.supplier.gstin}`}
          </span>
        </Fact>
        <Fact label="Billing Address">
          {po.billing.name}
          <span className="text-muted-foreground block text-xs">
            {po.billing.address}
          </span>
        </Fact>
        <Fact label="Delivery Address">
          {po.deliveryAddressDiffers ? po.deliveryAddress : "Project address"}
        </Fact>
        <Fact label="Place of supply">{state(po.placeOfSupplyStateCode)}</Fact>
        <Fact label="Supply type">
          {intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
        </Fact>
        <Fact label="Location">
          {po.siteLocation == null ? (
            "—"
          ) : (
            <Suspense fallback="…">
              <LocationLabel projectId={projectId} value={po.siteLocation} />
            </Suspense>
          )}
        </Fact>
        <Fact label="Supplier POC">{contact(po.supplierPoc)}</Fact>
        <Fact label="Site POC">{contact(po.sitePoc)}</Fact>
        <Fact label="Payment Terms">
          {po.paymentTermsDays == null
            ? "—"
            : `${String(po.paymentTermsDays)} days`}
        </Fact>
        <Fact label="Raised by">
          {po.createdBy.name ?? "—"}
          <span className="text-muted-foreground">
            {" "}
            · {stamp(po.createdAt)}
          </span>
        </Fact>
        {po.decidedAt != null && po.approvalStatus !== "pending" && (
          <Fact label={`${STAGE_LABELS[po.approvalStatus]} by`}>
            {po.decidedBy?.name ?? "—"}
            <span className="text-muted-foreground">
              {" "}
              · {stamp(po.decidedAt)}
            </span>
          </Fact>
        )}
        {po.rejectionReason != null && (
          <Fact label="Reason">{po.rejectionReason}</Fact>
        )}
        {po.orderedAt != null && (
          <Fact label="Ordered">
            {po.orderedBy?.name ?? "—"}
            <span className="text-muted-foreground">
              {" "}
              · {stamp(po.orderedAt)}
            </span>
          </Fact>
        )}
        {po.orderedAt != null && (
          <Fact label="Receipt">{RECEIPT_LABELS[po.receiptStatus]}</Fact>
        )}
        {po.closedAt != null && (
          <Fact label="Closed">
            {po.closedBy?.name ?? "—"} · {stamp(po.closedAt)}
            {po.closeReason != null && (
              <span className="text-muted-foreground block text-xs">
                {po.closeReason}
              </span>
            )}
          </Fact>
        )}
      </dl>

      <section aria-labelledby="po-lines" className="space-y-3">
        <h3 id="po-lines" className="font-semibold">
          Materials
        </h3>
        <ScrollTable label={`Lines of ${po.number}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              {intra ? (
                <>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                </>
              ) : (
                <TableHead className="text-right">IGST</TableHead>
              )}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <p className="font-medium">{item.materialName}</p>
                  {item.remark != null && (
                    <p className="text-muted-foreground text-xs">
                      {item.remark}
                    </p>
                  )}
                </TableCell>
                <TableCell>{item.hsnCode ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {quantityText(item.quantity)} {item.uomName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.unitRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.discountAmount === 0 ? "—" : money(item.discountAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.taxable)}
                </TableCell>
                {intra ? (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {money(item.cgst)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(item.sgst)}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="text-right tabular-nums">
                    {money(item.igst)}
                  </TableCell>
                )}
                <TableCell className="text-right font-medium tabular-nums">
                  {money(item.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {quantityText(item.receivedQty)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ScrollTable>
        <dl
          aria-label="Totals"
          className="ml-auto grid max-w-sm grid-cols-2 gap-1 text-sm"
        >
          <dt className="text-muted-foreground">Sub Total</dt>
          <dd className="text-right tabular-nums">{money(t.subTotal)}</dd>
          {t.discountTotal > 0 && (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="text-right tabular-nums">
                −{money(t.discountTotal)}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Taxable value</dt>
          <dd className="text-right tabular-nums">{money(t.taxableTotal)}</dd>
          {intra ? (
            <>
              <dt className="text-muted-foreground">CGST</dt>
              <dd className="text-right tabular-nums">{money(t.cgstTotal)}</dd>
              <dt className="text-muted-foreground">SGST</dt>
              <dd className="text-right tabular-nums">{money(t.sgstTotal)}</dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">IGST</dt>
              <dd className="text-right tabular-nums">{money(t.igstTotal)}</dd>
            </>
          )}
          {t.additionalCharges > 0 && (
            <>
              <dt className="text-muted-foreground">Additional Charges</dt>
              <dd className="text-right tabular-nums">
                {money(t.additionalCharges)}
              </dd>
            </>
          )}
          {t.deductionAmount > 0 && (
            <>
              <dt className="text-muted-foreground">Deduction</dt>
              <dd className="text-right tabular-nums">
                −{money(t.deductionAmount)}
              </dd>
            </>
          )}
          <dt className="font-semibold">Grand Total</dt>
          <dd className="text-right font-semibold tabular-nums">
            {money(t.grandTotal)}
          </dd>
        </dl>
        {po.remark != null && (
          <p className="text-sm">
            <span className="text-muted-foreground">Remark: </span>
            {po.remark}
          </p>
        )}
      </section>

      {po.terms.length > 0 && (
        <section aria-labelledby="po-terms" className="space-y-2">
          <h3 id="po-terms" className="font-semibold">
            Terms & Conditions
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {po.terms.map((term, index) => (
              <li key={`${term.title}-${String(index)}`}>
                <span className="font-medium">{term.title}</span>
                <span className="text-muted-foreground block">{term.body}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="po-receipts" className="space-y-2">
        <h3 id="po-receipts" className="font-semibold">
          Goods Receipts
        </h3>
        {po.goodsReceipts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing received against it yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {po.goodsReceipts.map((grn) => (
              <li
                key={grn.id}
                className="flex justify-between gap-2 px-3 py-2 text-sm"
              >
                <Link
                  href={`/app/projects/${encodeURIComponent(projectId)}/materials/goods-received/${grn.id}`}
                  className="font-medium hover:underline"
                >
                  {grn.number}
                </Link>
                <span className="text-muted-foreground">
                  {formatDate(grn.receiptDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DocumentFiles
        documentType="purchase_order"
        documentId={po.id}
        canEdit={canEditFiles}
      />
      <DocumentActivity
        documentType="purchase_order"
        documentId={po.id}
        heading="Remarks"
      />
    </div>
  );
}
