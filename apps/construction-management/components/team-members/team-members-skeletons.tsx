import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";

/** Masters → Team Members while it loads (ADR-0047). */

const NAME_WIDTHS = ["9rem", "12rem", "7.5rem", "10.5rem", "8rem"];
const LINE_WIDTHS = ["55%", "40%", "62%", "48%", "36%"];

/** Rows shaped like the list: name and status badge, Designation · contact, menu. */
export function TeamMemberRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading Team Members" className="block space-y-3">
      <SkeletonText width="7rem" />
      <ul className="divide-border divide-y rounded-lg border">
        {NAME_WIDTHS.map((width, row) => (
          <li key={width} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonText size="base" width={width} />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <SkeletonText width={LINE_WIDTHS[row]} />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Projects checklist: a checkbox, the name and its status badge. */
export function ProjectChecklistSkeleton() {
  return (
    <SkeletonGroup label="Loading Projects" className="block space-y-3">
      <ul className="bg-card divide-y rounded-xl border">
        {["46%", "32%", "54%"].map((width) => (
          <li key={width} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <SkeletonText width={width} className="flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Edit Team Member while the member loads: header, the tabs, the details form. */
const DETAIL_FIELDS = [
  { label: "Name" },
  { label: "Designation", control: "select" },
  { label: "Email" },
  { label: "Mobile" },
  { label: "Aadhaar" },
  { label: "PAN" },
  { label: "Address", control: "textarea" },
  { label: "Emergency contact" },
] as const;

/** Add Team Member while the Designations load: step 1, the details form. */
export function AddTeamMemberSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Team Members", href: "/app/masters/team-members" }}
          title="Add Team Member"
          meta="Step 1 of 3: Details"
        />
        <ol className="flex gap-1.5" aria-hidden="true">
          <li className="bg-primary h-1 flex-1 rounded-full" />
          <li className="bg-border h-1 flex-1 rounded-full" />
          <li className="bg-border h-1 flex-1 rounded-full" />
        </ol>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Member type</p>
            <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
              <Skeleton className="h-[4.25rem] rounded-lg" />
              <Skeleton className="h-[4.25rem] rounded-lg" />
            </div>
          </div>
          <FormSkeleton
            columns={2}
            label="Loading Designations"
            fields={[...DETAIL_FIELDS]}
          />
        </div>
      </div>
    </div>
  );
}

export function EditTeamMemberSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeaderSkeleton
          back={{ label: "Team Members", href: "/app/masters/team-members" }}
        />
        <Tabs defaultValue="details" className="gap-6">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="projects" disabled>
              Projects
            </TabsTrigger>
            <TabsTrigger value="permissions" disabled>
              Permission Matrix
            </TabsTrigger>
          </TabsList>
          <FormSkeleton
            columns={2}
            label="Loading Team Member"
            fields={[...DETAIL_FIELDS]}
          />
        </Tabs>
      </div>
    </div>
  );
}
