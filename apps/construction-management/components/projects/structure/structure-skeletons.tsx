"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

import { SectionHeader, wingPath, wingsPath } from "./structure-parts";

/*
 * Wings and Locations while they load (ADR-0047): the real section
 * headers, back links and field labels; bars where the data goes.
 */

const WIDTHS = ["58%", "44%", "66%", "50%", "62%"];

/** A divided card list of names with a meta line. */
function RowsSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <SkeletonGroup label={label}>
      <ul className="bg-card divide-y rounded-xl border">
        {WIDTHS.slice(0, rows).map((width, row) => (
          <li key={row} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <SkeletonText size="base" width={width} />
              <SkeletonText width="35%" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Wings: the real header, then a Phase heading over its Wings. */
export function WingsSkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      <SectionHeader title="Wings" meta={<SkeletonText width="14rem" />} />
      <section className="space-y-3">
        <div className="min-w-0 space-y-0.5">
          <SkeletonText size="base" width="8rem" />
          <SkeletonText width="12rem" />
        </div>
        <RowsSkeleton label="Loading Wings" />
      </section>
    </div>
  );
}

/** Locations: the real header, then the locations. */
export function LocationsSkeleton() {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <SectionHeader title="Locations" meta={<SkeletonText width="10rem" />} />
      <RowsSkeleton rows={4} label="Loading Locations" />
    </div>
  );
}

/** A Wing's chart: the real back link, the name a bar, floors × units. */
export function WingChartSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <WingHeaderSkeleton
        back={{ label: "Wings", href: wingsPath(projectId) }}
      />
      <SkeletonGroup label="Loading the Wing">
        <div className="bg-card w-full overflow-auto rounded-xl border">
          <table className="border-separate border-spacing-0 text-sm">
            <tbody>
              {[0, 1, 2, 3, 4].map((floor) => (
                <tr key={floor}>
                  <th className="bg-card border-r border-b px-3 py-2 text-left">
                    <SkeletonText width="4rem" />
                  </th>
                  <td className="border-b px-3 py-2">
                    <SkeletonText width="3rem" />
                  </td>
                  {[0, 1, 2, 3].map((unit) => (
                    <td key={unit} className="border-b p-1">
                      <Skeleton className="h-8 w-14 rounded-md" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SkeletonGroup>
    </div>
  );
}

/** `SectionHeader` whose title is data: the real back link, bars for the rest. */
function WingHeaderSkeleton({
  back,
}: {
  back: { label?: string; href: string };
}) {
  return (
    <div className="space-y-3">
      <Link
        href={back.href}
        className={buttonVariants({
          variant: "link",
          className:
            "text-muted-foreground hover:text-foreground h-auto justify-start gap-1.5 p-0 text-sm font-normal",
        })}
      >
        <ArrowLeft aria-hidden="true" />
        Back to{" "}
        {back.label ?? <SkeletonText width="5rem" className="inline-flex" />}
      </Link>
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          <span className="sr-only">Loading</span>
          <SkeletonText size="xl" width="12rem" />
        </h2>
        <SkeletonText width="16rem" />
      </div>
    </div>
  );
}

/** Add Wing's first step while the Phases load: the real header and labels. */
export function AddWingSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <SectionHeader
          back={{ label: "Wings", href: wingsPath(projectId) }}
          title="Add Wing"
          meta="Step 1 of 2 · Wing details"
        />
        <section className="bg-card rounded-xl border p-4 sm:p-6">
          <FormSkeleton
            label="Loading the Wing form"
            columns={2}
            actions={0}
            fields={[
              { label: "Phase", control: "select" },
              { label: "Wing Type", control: "select", wide: true },
              { label: "Wing Name", wide: true },
            ]}
          />
        </section>
      </div>
    </div>
  );
}

/** Edit Wing: the back link names the Wing, so it is a bar until it loads. */
export function EditWingSkeleton({
  projectId,
  wingId,
}: {
  projectId: string;
  wingId: string;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <WingHeaderSkeleton back={{ href: wingPath(projectId, wingId) }} />
        <section className="bg-card rounded-xl border p-4 sm:p-6">
          <FormSkeleton
            label="Loading the Wing"
            columns={2}
            actions={0}
            fields={[
              { label: "Wing Name" },
              { label: "Phase", control: "select" },
            ]}
          />
        </section>
        <RowsSkeleton label="Loading floors" />
      </div>
    </div>
  );
}
