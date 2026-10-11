import { useId } from "react";

import type { EquipmentUsageDashboard } from "@/src/queries/site-work-dashboard";

const HOURS = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function hoursLabel(hours: number): string {
  return `${HOURS.format(hours)} hrs`;
}

/**
 * Top Equipment by Work Hours (CM-608): the hourly machines with the most
 * hours, one horizontal bar each in the primary hue, the name and number
 * above the bar so it reads at 375 px. Each row is a list item that says
 * its figure, so no hidden table is needed.
 */
export function TopEquipmentChart({
  machines,
}: {
  machines: EquipmentUsageDashboard["topEquipment"];
}) {
  const titleId = useId();
  const max = Math.max(1, ...machines.map((machine) => machine.hours));
  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <figcaption id={titleId} className="text-sm font-semibold">
        Top equipment by work hours
      </figcaption>
      {machines.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hourly equipment worked in this period.
        </p>
      ) : (
        <ol className="space-y-2.5" aria-labelledby={titleId}>
          {machines.map((machine) => (
            <li key={machine.equipmentId} className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {machine.name}{" "}
                  <span className="text-muted-foreground text-xs">
                    {machine.equipmentNumber}
                    {machine.ownership === "rented" ? " · Rented" : ""}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {hoursLabel(machine.hours)}
                </span>
              </div>
              <div
                className="bg-muted h-2 w-full rounded-full"
                aria-hidden="true"
              >
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{
                    width: `max(2px, ${String((machine.hours / max) * 100)}%)`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

/**
 * Owned vs Rented (CM-608): work hours of hourly machines split by
 * ownership, as one bar in two hues with the figures named beside a
 * swatch each.
 */
export function OwnershipSplit({
  ownership,
}: {
  ownership: EquipmentUsageDashboard["ownership"];
}) {
  const titleId = useId();
  const total = ownership.owned.hours + ownership.rented.hours;
  const ownedShare = total === 0 ? 0 : (ownership.owned.hours / total) * 100;
  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <figcaption id={titleId} className="text-sm font-semibold">
        Owned vs rented hours
      </figcaption>
      {total === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hourly equipment worked in this period.
        </p>
      ) : (
        <>
          <div
            className="bg-muted flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
            aria-hidden="true"
          >
            {ownership.owned.hours > 0 ? (
              <div
                className="bg-primary h-full"
                style={{ width: `${String(ownedShare)}%` }}
              />
            ) : null}
            {ownership.rented.hours > 0 ? (
              <div className="bg-chart-2 h-full flex-1" />
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className="bg-primary inline-block size-2.5 rounded-sm"
                />
                Owned
              </dt>
              <dd className="font-medium tabular-nums">
                {hoursLabel(ownership.owned.hours)}
                <span className="text-muted-foreground block text-xs font-normal">
                  {ownership.owned.sheets === 1
                    ? "1 sheet"
                    : `${String(ownership.owned.sheets)} sheets`}
                </span>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className="bg-chart-2 inline-block size-2.5 rounded-sm"
                />
                Rented
              </dt>
              <dd className="font-medium tabular-nums">
                {hoursLabel(ownership.rented.hours)}
                <span className="text-muted-foreground block text-xs font-normal">
                  {ownership.rented.sheets === 1
                    ? "1 sheet"
                    : `${String(ownership.rented.sheets)} sheets`}
                </span>
              </dd>
            </div>
          </dl>
        </>
      )}
    </figure>
  );
}
