"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Clock,
  Fuel,
  HardHat,
  IndianRupee,
  Route,
  Truck,
  Hourglass,
} from "lucide-react";
import Link from "next/link";

import { formatPaise } from "@/components/money/money-input";
import { equipmentModulePath } from "@/components/site-work/equipment/equipment-tabs";
import { worksheetsPath } from "@/components/site-work/worksheets/worksheet-format";
import type { Duration } from "@/lib/dashboard-duration";
import {
  dailyWorkDashboardQuery,
  equipmentUsageDashboardQuery,
  type DailyWorkDashboard,
} from "@/src/queries/site-work-dashboard";

import { Fact, Section, SectionSkeleton, denied } from "./dashboard-parts";
import {
  hoursLabel,
  OwnershipSplit,
  TopEquipmentChart,
} from "./equipment-usage-charts";
import { LabourAvailabilityChart } from "./labour-availability-chart";

const NUMBER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-primary text-sm font-medium underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

/**
 * Contractor-wise Labour: Contractor with its Department underneath, so
 * four narrow columns fit a phone without scrolling sideways.
 */
function ContractorLabourTable({
  rows,
}: {
  rows: DailyWorkDashboard["contractors"];
}) {
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold" id="contractor-labour-heading">
        Contractor-wise labour
      </h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No worksheets in this period.
        </p>
      ) : (
        <table
          aria-labelledby="contractor-labour-heading"
          className="w-full table-fixed text-sm"
        >
          <thead className="text-muted-foreground border-b text-left text-xs">
            <tr>
              <th scope="col" className="w-[42%] py-2 pr-2 font-medium">
                Contractor
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                Skilled
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                Unskilled
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={`${row.contractorId}:${row.departmentId}`}>
                <th scope="row" className="py-2 pr-2 text-left font-normal">
                  <span className="block truncate font-medium">
                    {row.contractor ?? "A removed Contractor"}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {row.department ?? "A removed Department"}
                  </span>
                </th>
                <td className="py-2 pl-2 text-right tabular-nums">
                  {row.skilled}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  {row.unskilled}
                </td>
                <td className="py-2 pl-2 text-right font-medium tabular-nums">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Daily Work (CM-608): worksheets, labour-days and pending approvals, the
 * labour availability trend against attendance, and contractor-wise
 * labour, from live worksheets that are not rejected.
 */
export function DailyWorkSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    dailyWorkDashboardQuery(projectId, duration),
  );
  return (
    <Section
      id="dashboard-daily_work"
      title="Daily Work"
      aside={
        <SectionLink href={worksheetsPath(projectId)}>Worksheets</SectionLink>
      }
    >
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Daily Work needs the Dashboard permission on this Project."
            : "Daily Work could not be loaded."}
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Fact label="Worksheets" icon={ClipboardList}>
              {data.worksheets}
            </Fact>
            <Fact label="Labour-days" icon={HardHat}>
              {data.labourDays}
            </Fact>
            <Fact label="Pending approval" icon={Hourglass}>
              {data.pendingApprovals}
            </Fact>
          </dl>
          <LabourAvailabilityChart series={data.trend} />
          <ContractorLabourTable rows={data.contractors} />
        </div>
      )}
    </Section>
  );
}

/**
 * Equipment Usage (CM-608): sheets, hours, km, trips, fuel overruns and,
 * with Financial on Equipment Usage, the rented hire cost; the top
 * machines by work hours and owned against rented hours.
 */
export function EquipmentUsageSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    equipmentUsageDashboardQuery(projectId, duration),
  );
  return (
    <Section
      id="dashboard-equipment_usage"
      title="Equipment Usage"
      aside={
        <SectionLink href={equipmentModulePath(projectId, "usage-sheets")}>
          Usage sheets
        </SectionLink>
      }
    >
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Equipment Usage needs the Dashboard permission on this Project."
            : "Equipment Usage could not be loaded."}
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Fact label="Usage sheets" icon={Truck}>
              {data.sheets}
            </Fact>
            <Fact label="Work hours" icon={Clock}>
              {hoursLabel(data.hours)}
            </Fact>
            <Fact label="Distance" icon={Route}>
              {`${NUMBER.format(data.km)} km`}
            </Fact>
            <Fact label="Trips">{data.trips}</Fact>
            <Fact label="Fuel overruns" icon={Fuel}>
              {data.fuelOverruns}
            </Fact>
            {data.hireCost == null ? null : (
              <Fact label="Hire cost (rented)" icon={IndianRupee}>
                {formatPaise(data.hireCost)}
              </Fact>
            )}
          </dl>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <TopEquipmentChart machines={data.topEquipment} />
            <OwnershipSplit ownership={data.ownership} />
          </div>
        </div>
      )}
    </Section>
  );
}
