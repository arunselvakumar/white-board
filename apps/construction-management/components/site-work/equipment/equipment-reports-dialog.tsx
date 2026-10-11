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
import { Skeleton } from "@repo/ui/components/skeleton";

import { RecentReports } from "@/components/reports/recent-reports";
import {
  deviceToday,
  EQUIPMENT_REPORT_CATALOGUE,
} from "@/components/reports/report-catalogue";
import { ReportCard } from "@/components/reports/report-card";

const KINDS = EQUIPMENT_REPORT_CATALOGUE.map((definition) => definition.kind);

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
          <div className="grid gap-4 md:grid-cols-2">
            {EQUIPMENT_REPORT_CATALOGUE.map((definition) => (
              <ReportCard
                key={definition.kind}
                definition={definition}
                projectId={null}
                today={today}
              />
            ))}
          </div>
          <section
            aria-labelledby="equipment-recent-reports"
            className="space-y-3"
          >
            <h3 id="equipment-recent-reports" className="font-semibold">
              Your recent equipment reports
            </h3>
            <Suspense
              fallback={
                <div className="space-y-2" aria-hidden="true">
                  <Skeleton className="h-16 w-full" />
                </div>
              }
            >
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
