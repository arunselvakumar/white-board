import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";
import { bookingsPath } from "@/src/queries/sales-bookings";

/*
 * Bookings while they load (ADR-0047). `SkeletonGroup` wraps its bars in a
 * `display: contents` box, so spacing between them uses flex `gap`.
 */

const WIDTHS = ["62%", "48%", "70%", "55%", "66%"];

export const BOOKING_COLUMNS: SkeletonColumn[] = [
  { header: "Unit" },
  { header: "Customer" },
  { header: "Unit type", kind: "muted" },
  { header: "Booking Date", kind: "muted" },
  { header: "Hold until", kind: "muted" },
  { header: "Referred By", kind: "muted" },
  { header: "Status", kind: "badge" },
];

export function BookingRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading bookings"
      count
      columns={BOOKING_COLUMNS}
    />
  );
}

const FACTS = [
  "Unit",
  "Unit type",
  "Carpet area",
  "Booking Date",
  "Customer",
  "Mobile",
  "Email",
  "Referred By",
  "Created By",
];

/** One booking while it loads: the real back link, its facts and history. */
export function BookingDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="space-y-3">
        <Link
          href={bookingsPath(projectId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Bookings
        </Link>
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">
            <span className="sr-only">Loading the booking</span>
            <SkeletonText size="xl" width="min(14rem, 70vw)" />
          </h2>
          <SkeletonText width="min(18rem, 80vw)" />
        </div>
      </div>
      <div className="w-full max-w-4xl min-w-0 space-y-6">
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          {FACTS.map((label, index) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd>
                <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
              </dd>
            </div>
          ))}
        </dl>
        <section className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">History</h3>
          <SkeletonGroup label="Loading the history">
            <ol className="space-y-2 border-l pl-4">
              {WIDTHS.slice(0, 3).map((width, row) => (
                <li key={row}>
                  <SkeletonText width={width} />
                  <SkeletonText size="xs" width="30%" />
                </li>
              ))}
            </ol>
          </SkeletonGroup>
        </section>
      </div>
    </div>
  );
}
