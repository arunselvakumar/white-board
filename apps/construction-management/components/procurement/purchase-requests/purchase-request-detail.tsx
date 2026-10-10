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
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { purchaseRequestQuery } from "@/src/queries/purchase-requests";

import {
  purchaseRequestsPath,
  PurchaseRequestActions,
} from "./purchase-request-actions";
import { ScrollTable } from "./scroll-table";
import {
  APPROVAL_LABELS,
  ApprovalBadge,
  OrderBadge,
  quantityText,
} from "./purchase-request-format";

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

/**
 * One Purchase Request (CM-503): status, details, materials with ordered
 * and pending quantities, approval, the linked Purchase Orders, the
 * Required Materials List and the remarks thread.
 */
export function PurchaseRequestDetailPage({
  projectId,
  id,
  uploadFailed = 0,
}: {
  projectId: string;
  id: string;
  /** Files the wizard could not upload after saving. */
  uploadFailed?: number;
}) {
  const router = useRouter();
  const { data: pr } = useSuspenseQuery(purchaseRequestQuery(id));
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const [error, setError] = useState<string | undefined>(
    uploadFailed > 0
      ? `The request was saved, but ${String(uploadFailed)} ${uploadFailed === 1 ? "file" : "files"} did not upload. Add ${uploadFailed === 1 ? "it" : "them"} below.`
      : undefined,
  );
  const canEditFiles =
    access != null && canIn(access, "procurement.purchase_requests", "update");
  const decided = pr.decidedAt != null && pr.approvalStatus !== "pending";

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link
          href={purchaseRequestsPath(projectId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Purchase Requests
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{pr.number}</h2>
            <div className="flex flex-wrap gap-1">
              <ApprovalBadge status={pr.approvalStatus} />
              <OrderBadge status={pr.orderStatus} />
            </div>
          </div>
          <PurchaseRequestActions
            pr={pr}
            variant="buttons"
            onError={setError}
            onDeleted={() => {
              router.push(purchaseRequestsPath(projectId));
            }}
          />
        </div>
        <FormAlert message={error} />
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Fact label="Purchase Request Date">{formatDate(pr.requestDate)}</Fact>
        <Fact label="Required Date">
          {pr.requiredDate == null ? "—" : formatDate(pr.requiredDate)}
        </Fact>
        <Fact label="Location">
          {pr.siteLocation == null ? (
            "—"
          ) : (
            <Suspense fallback="…">
              <LocationLabel projectId={projectId} value={pr.siteLocation} />
            </Suspense>
          )}
        </Fact>
        <Fact label="Raised by">{pr.createdBy.name ?? "—"}</Fact>
        <Fact label="Raised on">{stamp(pr.createdAt)}</Fact>
        <Fact label="Source">
          {pr.source === "inventory"
            ? "Current Inventory"
            : "Purchase Request list"}
        </Fact>
        {decided && (
          <Fact label={`${APPROVAL_LABELS[pr.approvalStatus]} by`}>
            {pr.decidedBy?.name ?? "—"}
            {pr.decidedAt != null && (
              <span className="text-muted-foreground">
                {" "}
                · {stamp(pr.decidedAt)}
              </span>
            )}
          </Fact>
        )}
        {pr.rejectionReason != null && (
          <Fact label="Reason">{pr.rejectionReason}</Fact>
        )}
        {pr.markedOrderedAt != null && (
          <Fact label="Marked as Ordered">
            {pr.markedOrderedBy?.name ?? "—"}
            <span className="text-muted-foreground">
              {" "}
              · {stamp(pr.markedOrderedAt)}
            </span>
          </Fact>
        )}
      </dl>

      <section aria-labelledby="pr-materials" className="space-y-2">
        <h3 id="pr-materials" className="font-semibold">
          Materials
        </h3>
        <ScrollTable label={`Materials of ${pr.number}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Requested</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              {pr.separateRemarks && <TableHead>Remark</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pr.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.materialName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.categoryName ?? "—"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {quantityText(item.quantity)} {item.uomName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {quantityText(item.orderedQty)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {quantityText(item.pendingQty)}
                </TableCell>
                {pr.separateRemarks && (
                  <TableCell className="text-muted-foreground">
                    {item.remark ?? "—"}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </ScrollTable>
        {!pr.separateRemarks && pr.commonRemark != null && (
          <p className="text-sm">
            <span className="text-muted-foreground">Common Remark: </span>
            {pr.commonRemark}
          </p>
        )}
        {pr.remark != null && (
          <p className="text-sm">
            <span className="text-muted-foreground">Remark: </span>
            {pr.remark}
          </p>
        )}
      </section>

      <section aria-labelledby="pr-orders" className="space-y-2">
        <h3 id="pr-orders" className="font-semibold">
          Purchase Orders
        </h3>
        {pr.purchaseOrders.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Purchase Order raised against it yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {pr.purchaseOrders.map((po) => (
              <li
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <Link
                  href={`/app/projects/${encodeURIComponent(projectId)}/materials/purchase-orders/${po.id}`}
                  className="font-medium hover:underline"
                >
                  {po.number}
                </Link>
                <span className="text-muted-foreground">
                  {formatDate(po.orderDate)} · {po.supplierName} ·{" "}
                  {APPROVAL_LABELS[po.approvalStatus]}
                </span>
                <span className="tabular-nums">{money(po.grandTotal)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DocumentFiles
        documentType="purchase_request"
        documentId={pr.id}
        canEdit={canEditFiles}
        heading="Upload Required Materials List"
      />
      <DocumentActivity
        documentType="purchase_request"
        documentId={pr.id}
        heading="Remarks"
      />
    </div>
  );
}
