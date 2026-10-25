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
import { formatDate } from "@/components/payments/payment-format";
import { ScrollTable } from "@/components/procurement/purchase-requests/scroll-table";
import { SiteWorkDocumentActivity } from "@/components/site-work/documents/site-work-document-activity";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import { worksheetQuery } from "@/src/queries/worksheets";
import { SHEET_APPROVAL_LABELS } from "@/src/site-work/domain/shift";

import { WorksheetActions } from "./worksheet-actions";
import { WorksheetTaskLink } from "./worksheet-task-picker";
import {
  headcountText,
  quantityText,
  SheetApprovalBadge,
  shiftLabel,
  worksheetsPath,
} from "./worksheet-format";
import { FactValueSkeleton } from "@/components/procurement/procurement-skeletons";

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
 * One Daily Worksheet (CM-602): everything it records — even sections the
 * Project now hides — with the location label, approval and its actions
 * (approve, reject with a reason, edit, duplicate, delete), then the
 * remarks and photos.
 */
export function WorksheetDetailPage({
  projectId,
  id,
  uploadFailed = [],
}: {
  projectId: string;
  id: string;
  /** Names of photos the form could not upload after saving. */
  uploadFailed?: readonly string[];
}) {
  const router = useRouter();
  const { data: sheet } = useSuspenseQuery(worksheetQuery(id));
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  const canEditFiles =
    access != null &&
    (canInSiteWork(access, "site_work.daily_worksheet", "create") ||
      canInSiteWork(access, "site_work.daily_worksheet", "update"));
  const [error, setError] = useState<string | undefined>(
    uploadFailed.length > 0
      ? `The worksheet was saved, but ${uploadFailed.join(", ")} did not upload. Add ${uploadFailed.length === 1 ? "it" : "them"} under Work Photos.`
      : undefined,
  );
  const decided =
    sheet.decidedAt != null &&
    (sheet.approvalStatus === "approved" ||
      sheet.approvalStatus === "rejected");

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link
          href={worksheetsPath(projectId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Daily Worksheet
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{sheet.number}</h2>
            <p className="text-muted-foreground text-sm">
              {formatDate(sheet.sheetDate)} · {shiftLabel(sheet.shift)}
            </p>
            <SheetApprovalBadge status={sheet.approvalStatus} />
          </div>
          <WorksheetActions
            sheet={sheet}
            variant="buttons"
            onError={setError}
            onDeleted={() => {
              router.push(worksheetsPath(projectId));
            }}
          />
        </div>
        <FormAlert message={error} />
      </div>

      <dl className="bg-card grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Fact label="Location">
          {sheet.siteLocation == null ? (
            "—"
          ) : (
            <Suspense fallback={<FactValueSkeleton />}>
              <LocationLabel projectId={projectId} value={sheet.siteLocation} />
            </Suspense>
          )}
        </Fact>
        <Fact label="Contractor">{sheet.contractor.name ?? "—"}</Fact>
        <Fact label="Department">{sheet.department.name ?? "—"}</Fact>
        <Fact label="Work Type">{sheet.workType?.name ?? "—"}</Fact>
        <Fact label="Labour">{headcountText(sheet)}</Fact>
        <Fact label="Approx Work Done">
          {sheet.approxWorkQty == null
            ? "—"
            : `${quantityText(sheet.approxWorkQty)} ${sheet.approxWorkUnit?.name ?? ""}`.trim()}
        </Fact>
        <Fact label="Task">
          {sheet.task == null ? (
            "—"
          ) : (
            <WorksheetTaskLink projectId={projectId} task={sheet.task} detail />
          )}
        </Fact>
        <Fact label="Filled By">{sheet.createdBy.name ?? "—"}</Fact>
        <Fact label="Filled on">{stamp(sheet.createdAt)}</Fact>
        {decided && (
          <Fact label={`${SHEET_APPROVAL_LABELS[sheet.approvalStatus]} by`}>
            {sheet.decidedBy?.name ?? "—"}
            {sheet.decidedAt != null && (
              <span className="text-muted-foreground">
                {" "}
                · {stamp(sheet.decidedAt)}
              </span>
            )}
          </Fact>
        )}
        {sheet.rejectionReason != null && (
          <Fact label="Reason">{sheet.rejectionReason}</Fact>
        )}
      </dl>

      <section aria-labelledby="worksheet-materials" className="space-y-2">
        <h3 id="worksheet-materials" className="font-semibold">
          Material Consumption
        </h3>
        {sheet.materials.length === 0 ? (
          <p className="text-muted-foreground text-sm">No material consumed.</p>
        ) : (
          <ScrollTable label={`Materials of ${sheet.number}`}>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Used Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.materials.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">
                    {line.materialName}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {quantityText(line.quantity)} {line.unitName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        )}
      </section>

      {sheet.remark != null && (
        <section aria-labelledby="worksheet-remark" className="space-y-1">
          <h3 id="worksheet-remark" className="font-semibold">
            Remark
          </h3>
          <p className="text-sm whitespace-pre-line">{sheet.remark}</p>
        </section>
      )}

      <SiteWorkDocumentActivity
        documentType="worksheet"
        documentId={sheet.id}
        canEdit={canEditFiles}
        filesHeading="Work Photos"
      />
    </div>
  );
}
