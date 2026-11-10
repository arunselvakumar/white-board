"use client";

import { FileSpreadsheet } from "lucide-react";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { useSuspenseQuery } from "@tanstack/react-query";

import { RecentReports } from "@/components/reports/recent-reports";
import {
  deviceToday,
  type ReportDefinition,
} from "@/components/reports/report-catalogue";
import { ReportCard } from "@/components/reports/report-card";
import { reportCatalogueQuery } from "@/src/queries/report-catalogue";
import {
  RecentReportsSkeleton,
  ReportCardGridSkeleton,
} from "@/components/reports/reports-skeletons";

/** The central reports of Masters → Equipments. */
const KINDS: readonly ReportDefinition["kind"][] = [
  "equipment_maintenance",
  "equipment_transfers",
];

/** The equipment cards the viewer may run, worded by the report catalogue. */
function EquipmentReportCards({ today }: { today: string }) {
  const { data } = useSuspenseQuery(reportCatalogueQuery(null));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.items
        .filter((definition) => KINDS.includes(definition.kind))
        .map((definition) => (
          <ReportCard
            key={definition.kind}
            definition={definition}
            projectId={null}
            today={today}
          />
        ))}
    </div>
  );
}

/**
 * Masters → Equipments → Reports (CM-605): the central Equipment
 * Maintenance and Equipment Transfers reports, every machine at any
 * Project or the warehouse, and the viewer's recent ones.
 */
export function EquipmentReportsDialog({
  open,
  onClose,
  today = deviceToday(),
}: {
  open: boolean;
  onClose: () => void;
  today?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Equipment reports</DialogTitle>
          <DialogDescription>
            Every machine of the Company, at any Project or the warehouse. Each
            report is an Excel workbook and a PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-0.5">
          <Suspense fallback={<ReportCardGridSkeleton count={2} />}>
            <EquipmentReportCards today={today} />
          </Suspense>
          <section
            aria-labelledby="equipment-recent-reports"
            className="space-y-3"
          >
            <h3 id="equipment-recent-reports" className="font-semibold">
              Your recent equipment reports
            </h3>
            <Suspense fallback={<RecentReportsSkeleton rows={1} />}>
              <RecentReports projectId={null} kinds={KINDS} />
            </Suspense>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The Reports button of Masters → Equipments, with its dialog. */
export function EquipmentReportsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <FileSpreadsheet aria-hidden="true" />
        Reports
      </Button>
      {open ? (
        <EquipmentReportsDialog
          open
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
