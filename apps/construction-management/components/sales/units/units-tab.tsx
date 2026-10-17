"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Building2, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";

import { wingsPath } from "@/components/projects/structure/structure-parts";
import { isWingType } from "@/src/projects/domain/wing-generator";
import { unitChartQuery, type UnitChart } from "@/src/queries/sales-units";
import {
  UNIT_SALES_STATUS_LABELS,
  UNIT_SALES_STATUSES,
} from "@/src/sales/domain/sales-terms";

import { ImportUnitsDialog } from "./import-units-dialog";
import { SalesUnitsChart } from "./sales-units-chart";
import { UNIT_STATUS_DOTS } from "./sales-status";
import { UnitPanel } from "./unit-panel";

function Counts({
  label,
  counts,
}: {
  label: string;
  counts: UnitChart["counts"];
}) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {UNIT_SALES_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${UNIT_STATUS_DOTS[status]}`}
          />
          <span>{UNIT_SALES_STATUS_LABELS[status]}</span>
          <span className="font-semibold tabular-nums">{counts[status]}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bookings → **Units** (CM-1005, ADR CM-0022 §8): the Project's units by
 * sales status — Available, On Hold, Booked, Unavailable, with counts for
 * the Project and the Wing — a Wing picker, the Wing's floors × units grid
 * and, for the unit chosen, its panel with details, booking and actions.
 * Booking Update holders import unit details from Excel.
 */
export function UnitsTab({ projectId }: { projectId: string }) {
  const [wingId, setWingId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [, startTransition] = useTransition();
  const { data } = useSuspenseQuery(unitChartQuery(projectId, wingId));
  const wing = data.wing;
  const unitName =
    wing?.floors
      .flatMap((floor) => floor.units)
      .find((unit) => unit.id === unitId)?.name ?? "Unit";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Units</h2>
        {data.actions.update && data.wings.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setImporting(true);
            }}
          >
            <FileSpreadsheet aria-hidden="true" />
            Import unit details
          </Button>
        )}
      </div>

      {wing == null ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>No Wings yet</EmptyTitle>
            <EmptyDescription>
              Units for sale come from the Project&apos;s Wings. Add a Wing with
              its floors and units first.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href={wingsPath(projectId)}
              className={buttonVariants({ size: "sm" })}
            >
              Open Wings
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <section
            aria-label="All units"
            className="bg-muted/40 space-y-1 rounded-lg border p-3"
          >
            <p className="text-sm font-medium">
              {data.counts.total} {data.counts.total === 1 ? "unit" : "units"}{" "}
              in this Project
            </p>
            <Counts label="Units by sales status" counts={data.counts} />
          </section>
          <div className="flex flex-wrap items-end gap-3">
            {data.wings.length > 1 ? (
              <div className="w-full min-w-0 space-y-1 sm:w-64">
                <Label htmlFor="units-wing" className="text-xs">
                  Wing
                </Label>
                <Select
                  items={data.wings.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                  value={wing.id}
                  onValueChange={(next) => {
                    if (next == null) return;
                    startTransition(() => {
                      setWingId(next);
                      setUnitId(null);
                    });
                  }}
                >
                  <SelectTrigger id="units-wing" className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {data.wings.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} · {item.counts.total}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <h3 className="text-base font-semibold">{wing.name}</h3>
            )}
            <Counts
              label={`${wing.name} by sales status`}
              counts={wing.counts}
            />
          </div>
          <SalesUnitsChart
            name={wing.name}
            type={isWingType(wing.type) ? wing.type : "residential"}
            floors={wing.floors}
            selectedId={unitId}
            onSelect={setUnitId}
          />
        </>
      )}

      <Sheet
        open={unitId != null}
        onOpenChange={(open) => {
          if (!open) setUnitId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="min-w-0 pr-10">
            <SheetTitle>{unitName}</SheetTitle>
            <SheetDescription>Sales details and booking</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {unitId != null && (
              <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                <UnitPanel projectId={projectId} unitId={unitId} />
              </Suspense>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {data.actions.update && (
        <ImportUnitsDialog
          projectId={projectId}
          open={importing}
          onClose={() => {
            setImporting(false);
          }}
        />
      )}
    </div>
  );
}
