import { FolderKanban, ShieldCheck, UserRound } from "lucide-react";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";
import { USERS_PATH } from "@/lib/users-roles-nav";

/** Users & Roles → Users while it loads (ADR-0047). */

const NAME_WIDTHS = ["9rem", "12rem", "7.5rem", "10.5rem", "8rem"];
const LINE_WIDTHS = ["55%", "40%", "62%", "48%", "36%"];

/**
 * Rows shaped like the list: name and status badge, Designation · contact,
 * the Role, menu.
 */
export function TeamMemberRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading Users" className="block space-y-3">
      <SkeletonText width="7rem" />
      <div className="rounded-lg border">
        <div className="text-muted-foreground bg-muted/40 hidden items-center gap-4 rounded-t-lg border-b px-4 py-2 text-xs font-medium sm:flex">
          <span className="flex-1">User</span>
          <span className="w-40">Role</span>
          <span className="w-8" />
        </div>
        <ul className="divide-border divide-y">
          {NAME_WIDTHS.map((width, row) => (
            <li key={width} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SkeletonText size="base" width={width} />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <SkeletonText width={LINE_WIDTHS[row]} />
              </div>
              <span className="hidden w-40 shrink-0 sm:block">
                <SkeletonText width="6rem" />
              </span>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
            </li>
          ))}
        </ul>
      </div>
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

/** Edit User while the member loads: header, the tabs, the details form. */
const DETAIL_FIELDS = [
  { label: "Name" },
  { label: "Designation", control: "select" },
  { label: "Aadhaar" },
  { label: "PAN" },
  { label: "Address" },
  { label: "Emergency contact" },
  { label: "Mobile" },
  { label: "Email" },
] as const;

/** Add User while the Designations and Roles load: step 1, the details form. */
export function AddTeamMemberSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Users", href: USERS_PATH }}
          title="Add User"
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
        <PageHeaderSkeleton back={{ label: "Users", href: USERS_PATH }} />
        <Tabs defaultValue="details" className="gap-6">
          <TabsList>
            <TabsTrigger value="details">
              <UserRound aria-hidden="true" />
              Details
            </TabsTrigger>
            <TabsTrigger value="projects" disabled>
              <FolderKanban aria-hidden="true" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="role" disabled>
              <ShieldCheck aria-hidden="true" />
              Role
            </TabsTrigger>
          </TabsList>
          <FormSkeleton
            columns={2}
            label="Loading User"
            fields={[...DETAIL_FIELDS]}
          />
        </Tabs>
      </div>
    </div>
  );
}
