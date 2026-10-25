import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  ItemListSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

import { PageHeader } from "@/components/app-shell/page-header";

/** My Profile and its account sections while they load (ADR-0047). */

/** The Push by menu list: a menu name and its switch per row. */
export function PushMenuListSkeleton() {
  return (
    <SkeletonGroup label="Loading notification settings" className="block">
      <ul className="divide-y rounded-xl border">
        {["40%", "55%", "32%", "48%"].map((width) => (
          <li
            key={width}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <SkeletonText width={width} />
            <Skeleton className="h-[1.15rem] w-8 shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** My Profile while the profile loads: photo, contact fields. */
export function MyProfileSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader title="My Profile" meta={<SkeletonText width="10rem" />} />
        <SkeletonGroup label="Loading your profile" className="block space-y-8">
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Photo</h2>
              <p className="text-muted-foreground text-sm">
                Shown on your account menu and to your team.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="size-20 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <SkeletonText size="xs" width="14rem" />
              </div>
            </div>
          </section>
          <section className="space-y-4">
            <h2 className="text-base font-semibold">Contact</h2>
            <FormSkeleton
              columns={2}
              actions={0}
              fields={[
                { label: "Name" },
                { label: "Mobile" },
                { label: "Email" },
                { label: "Emergency contact" },
                { label: "Address", control: "textarea", wide: true },
              ]}
            />
          </section>
        </SkeletonGroup>
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

/** My Profile → Devices while the sessions load. */
export function DevicesSectionSkeleton() {
  return (
    <section className="min-w-0 space-y-4">
      <SectionHeading
        title="Devices"
        description="Where you are signed in. Sign out of a device you do not recognise."
      />
      <ItemListSkeleton
        rows={2}
        media="icon"
        trailing="action"
        label="Loading devices"
      />
    </section>
  );
}

/** My Profile → Privacy while the account loads. */
export function PrivacySectionSkeleton() {
  return (
    <section className="min-w-0 space-y-4">
      <SectionHeading
        title="Privacy"
        description="Your own data and your account."
      />
      <ItemListSkeleton
        rows={2}
        media="icon"
        trailing="action"
        label="Loading privacy"
      />
    </section>
  );
}
