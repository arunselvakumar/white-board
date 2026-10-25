"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { buttonVariants } from "@repo/ui/components/button";
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
  quantityText,
  SheetApprovalBadge,
  shiftLabel,
} from "@/components/site-work/worksheets/worksheet-format";
import {
  equipmentSheetQuery,
  equipmentSheetsPath,
} from "@/src/queries/equipment-sheets";
import { newHindranceFromUsageSheetPath } from "@/src/queries/hindrances";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import {
  HIRE_BASIS_LABELS,
  UTILISATION_BASIS_LABELS,
  WORKING_TIME_METHOD_LABELS,
} from "@/src/site-work/domain/equipment";
import { FUEL_BORNE_BY_LABELS } from "@/src/site-work/domain/equipment-usage";
import { SHEET_APPROVAL_LABELS } from "@/src/site-work/domain/shift";

import { EquipmentSheetActions } from "./equipment-sheet-actions";
import {
  billableUnit,
  fuelText,
  hoursText,
  moneyText,
  OwnershipBadge,
  usageText,
} from "./equipment-sheet-format";
import { trimDecimal } from "./equipment-sheet-live";
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
 * One Equipment Usage sheet (CM-604): the machine, its working time
 * (shifts, meter with the gap from the previous closing, km or trips),
 * idle and breakdown, the work, fuel with the overrun, the hire (with
 * Financial), materials and approval — with **Record hindrance** when it
 * broke down, Duplicate, Edit, Delete, approve / reject, and the remarks
 * and files.
 */
export function EquipmentSheetDetailPage({
  projectId,
  id,
  uploadFailed = [],
}: {
  projectId: string;
  id: string;
  /** Names of files the form could not upload after saving. */
  uploadFailed?: readonly string[];
}) {
  const router = useRouter();
  const { data: sheet } = useSuspenseQuery(equipmentSheetQuery(id));
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  const may = (
    menu: Parameters<typeof canInSiteWork>[1],
    flag: Parameters<typeof canInSiteWork>[2],
  ) => access != null && canInSiteWork(access, menu, flag);
  const canEditFiles =
    may("site_work.equipment_usage", "create") ||
    may("site_work.equipment_usage", "update");
  const brokeDown = Number(sheet.breakdownHours) > 0;
  const canRecordHindrance = brokeDown && may("site_work.hindrances", "create");
  const [error, setError] = useState<string | undefined>(
    uploadFailed.length > 0
      ? `The usage sheet was saved, but ${uploadFailed.join(", ")} did not upload. Add ${uploadFailed.length === 1 ? "it" : "them"} under Files.`
      : undefined,
  );
  const decided =
    sheet.decidedAt != null &&
    (sheet.approvalStatus === "approved" ||
      sheet.approvalStatus === "rejected");
  const gap = sheet.meterGap == null ? 0 : Number(sheet.meterGap);
  const mismatch =
    sheet.workingTimeMethod === "both" &&
    sheet.meterDelta != null &&
    sheet.shiftHours != null &&
    Number(sheet.meterDelta) !== Number(sheet.shiftHours);
  const usesShifts =
    sheet.workingTimeMethod === "time_shifts" ||
    sheet.workingTimeMethod === "both";

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link
          href={equipmentSheetsPath(projectId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Usage sheets
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{sheet.number}</h2>
            <p className="text-muted-foreground text-sm">
              {formatDate(sheet.sheetDate)} · {shiftLabel(sheet.shift)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <OwnershipBadge ownership={sheet.ownership} />
              <SheetApprovalBadge status={sheet.approvalStatus} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRecordHindrance && (
              <Link
                href={newHindranceFromUsageSheetPath(projectId, {
                  id: sheet.id,
                  date: sheet.sheetDate,
                  activity:
                    sheet.workItem ??
                    `${sheet.equipment.name} · ${sheet.equipment.equipmentNumber}`,
                })}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Record hindrance
              </Link>
            )}
            <EquipmentSheetActions
              sheet={sheet}
              variant="buttons"
              onError={setError}
              onDeleted={() => {
                router.push(equipmentSheetsPath(projectId));
              }}
            />
          </div>
        </div>
        <FormAlert message={error} />
      </div>

      <dl className="bg-card grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Fact label="Equipment">
          {sheet.equipment.name} · {sheet.equipment.equipmentNumber}
        </Fact>
        <Fact label="Measured by">
          {UTILISATION_BASIS_LABELS[sheet.utilisationBasis]} ·{" "}
          {WORKING_TIME_METHOD_LABELS[sheet.workingTimeMethod]}
        </Fact>
        <Fact label="Usage">{usageText(sheet)}</Fact>
        <Fact label="Idle">{hoursText(sheet.idleHours)}</Fact>
        <Fact label="Breakdown">{hoursText(sheet.breakdownHours)}</Fact>
        <Fact label="Operator">{sheet.operatorName ?? "—"}</Fact>
        <Fact label="Supervisor">{sheet.supervisor?.name ?? "—"}</Fact>
        <Fact label="Contractor">{sheet.contractor?.name ?? "—"}</Fact>
        <Fact label="Department">{sheet.department?.name ?? "—"}</Fact>
        <Fact label="Work Item">{sheet.workItem ?? "—"}</Fact>
        <Fact label="Location">
          {sheet.siteLocation == null ? (
            "—"
          ) : (
            <Suspense fallback={<FactValueSkeleton />}>
              <LocationLabel projectId={projectId} value={sheet.siteLocation} />
            </Suspense>
          )}
        </Fact>
        <Fact label="Approx Work Done">
          {sheet.approxWorkQty == null
            ? "—"
            : `${quantityText(sheet.approxWorkQty)} ${sheet.approxWorkUnit?.name ?? ""}`.trim()}
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

      <section aria-labelledby="equipment-sheet-time" className="space-y-2">
        <h3 id="equipment-sheet-time" className="font-semibold">
          Working time
        </h3>
        {usesShifts && sheet.timeShifts.length > 0 && (
          <ScrollTable label={`Time shifts of ${sheet.number}`}>
            <TableHeader>
              <TableRow>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.timeShifts.map((shift) => (
                <TableRow key={`${shift.startTime}-${shift.endTime}`}>
                  <TableCell className="tabular-nums">
                    {shift.startTime}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {shift.endTime}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trimDecimal((shift.minutes / 60).toFixed(2))} h
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        )}
        {usesShifts && sheet.shiftHours != null && (
          <p className="text-sm">
            Shift hours:{" "}
            <span className="font-medium">
              {trimDecimal(sheet.shiftHours)} h
            </span>
          </p>
        )}
        {sheet.openingReading != null && (
          <p className="text-sm">
            Meter: {trimDecimal(sheet.openingReading)} →{" "}
            {trimDecimal(sheet.closingReading ?? "0")}
            {sheet.meterDelta != null &&
              ` (${trimDecimal(sheet.meterDelta)} ${sheet.utilisationBasis === "km" ? "km" : "h"})`}
          </p>
        )}
        {sheet.previousClosing != null && gap !== 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            The previous closing was{" "}
            {trimDecimal(sheet.previousClosing.reading)} on{" "}
            {formatDate(sheet.previousClosing.sheetDate)}: a gap of{" "}
            {trimDecimal(Math.abs(gap).toFixed(2))}.
          </p>
        )}
        {mismatch && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            The shifts give {trimDecimal(sheet.shiftHours ?? "0")} h but the
            meter {trimDecimal(sheet.meterDelta ?? "0")} h.
          </p>
        )}
      </section>

      <section aria-labelledby="equipment-sheet-fuel" className="space-y-1">
        <h3 id="equipment-sheet-fuel" className="font-semibold">
          Fuel
        </h3>
        <p className="text-sm">
          {fuelText(sheet.fuelQty, sheet.equipment.fuelUnit)}
          {sheet.fuelBorneBy != null &&
            ` · borne by ${FUEL_BORNE_BY_LABELS[sheet.fuelBorneBy]}`}
        </p>
        {sheet.fuelOverrun && (
          <p className="text-destructive flex items-center gap-1 text-sm">
            <TriangleAlert aria-hidden="true" className="size-4" />
            Fuel overrun: above the expected{" "}
            {trimDecimal(
              sheet.equipment.expectedFuelEfficiency ?? "0",
            )} per{" "}
            {{ hourly: "hour", km: "km", trip: "trip" }[sheet.utilisationBasis]}
          </p>
        )}
      </section>

      {sheet.ownership === "rented" && sheet.hireCost != null && (
        <section aria-labelledby="equipment-sheet-hire" className="space-y-2">
          <h3 id="equipment-sheet-hire" className="font-semibold">
            Hire
          </h3>
          <dl className="bg-card grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
            <Fact label="Hire party">
              {sheet.equipment.hireParty?.name ?? "—"}
            </Fact>
            <Fact label="Unit Rate">
              {moneyText(sheet.unitRate)}
              {sheet.equipment.hireBasis != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · {HIRE_BASIS_LABELS[sheet.equipment.hireBasis]}
                </span>
              )}
            </Fact>
            <Fact label="Billable quantity">
              {sheet.billableQty == null
                ? "—"
                : `${trimDecimal(sheet.billableQty)} ${billableUnit(sheet.equipment.hireBasis)}`}
            </Fact>
            <Fact label="Hire Cost">
              <span className="font-semibold">{moneyText(sheet.hireCost)}</span>
            </Fact>
          </dl>
        </section>
      )}

      <section
        aria-labelledby="equipment-sheet-materials"
        className="space-y-2"
      >
        <h3 id="equipment-sheet-materials" className="font-semibold">
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
        <section aria-labelledby="equipment-sheet-remark" className="space-y-1">
          <h3 id="equipment-sheet-remark" className="font-semibold">
            Remark
          </h3>
          <p className="text-sm whitespace-pre-line">{sheet.remark}</p>
        </section>
      )}

      <SiteWorkDocumentActivity
        documentType="equipment_usage"
        documentId={sheet.id}
        canEdit={canEditFiles}
        filesHeading="Files"
      />
    </div>
  );
}
