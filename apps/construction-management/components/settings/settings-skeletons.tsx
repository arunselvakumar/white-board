import type { ReactNode } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  BACKDATED_MODULE_GROUPS,
  BACKDATED_MODULES,
} from "@/src/shared-kernel/backdated-policy";
import {
  GRN_FIELD_GROUP_LABELS,
  GRN_FIELD_GROUPS,
  GRN_FIELD_INFO,
} from "@/src/shared-kernel/grn-fields";

/*
 * Settings → Advanced Settings pages while they load (ADR-0047): the real header
 * and section headings; bars only where the saved values appear.
 */

const BACK = { label: "Settings", href: "/app/settings" };

function SettingsPage({
  title,
  meta,
  spacing = "space-y-6",
  children,
}: {
  title: string;
  meta: string;
  spacing?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className={cn("w-full max-w-4xl", spacing)}>
        <PageHeader back={BACK} title={title} meta={meta} />
        {children}
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card space-y-4 rounded-xl border p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function BackdatedEntrySkeleton() {
  return (
    <SettingsPage
      spacing="space-y-8"
      title="Back-dated Entry"
      meta="How far back your team may date new entries and edit old ones. 0 days means no limit; the Owner is never limited by days."
    >
      <SkeletonGroup
        label="Loading Back-dated Entry"
        className="block space-y-8"
      >
        <SettingsCard
          title="Default limits"
          description="Apply to every module set to Global. With no override Designations, the limit is a hard block for everyone but the Owner."
        >
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "Restrict creating entries older than" },
              {
                label: "Designations that may create older entries",
                control: "select",
              },
              { label: "Restrict editing entries older than" },
              {
                label: "Designations that may edit older entries",
                control: "select",
              },
            ]}
          />
        </SettingsCard>
        <SettingsCard
          title="Module overrides"
          description="Give a module its own limits. The date checked is the entry's own date, not when it was typed in."
        >
          <div className="space-y-6">
            {BACKDATED_MODULE_GROUPS.map((group) => (
              <div key={group.key} className="space-y-2">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                  {group.label}
                </h3>
                <ul className="bg-card divide-y rounded-lg border">
                  {BACKDATED_MODULES.filter(
                    (item) => item.group === group.key,
                  ).map((item) => (
                    <li
                      key={item.key}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.label}</p>
                        <SkeletonText width="12rem" />
                      </div>
                      <Skeleton className="h-10 w-14 rounded-lg" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SettingsCard>
      </SkeletonGroup>
    </SettingsPage>
  );
}

export function GrnFieldsSkeleton() {
  const fields = Object.values(GRN_FIELD_INFO);
  return (
    <SettingsPage
      spacing="space-y-8"
      title="GRN fields"
      meta="Choose which optional fields a Goods Receipt shows. Hidden fields are neither shown on the form nor printed."
    >
      <SkeletonGroup label="Loading GRN fields" className="block space-y-8">
        {GRN_FIELD_GROUPS.map((group) => (
          <section key={group} className="space-y-3">
            <h2 className="text-base font-semibold">
              {GRN_FIELD_GROUP_LABELS[group]}
            </h2>
            <ul className="bg-card divide-y rounded-xl border">
              {fields
                .filter((field) => field.group === group)
                .map((field) => (
                  <li
                    key={field.label}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <span className="min-w-0 text-sm">{field.label}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <SkeletonText width="3rem" />
                      <Skeleton className="h-[1.15rem] w-8 rounded-full" />
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </SkeletonGroup>
    </SettingsPage>
  );
}

/** Rows of a settings list: a name line, two detail lines, the row's controls. */
function SettingsRowsSkeleton({
  label,
  trailing,
}: {
  label: string;
  trailing: ReactNode;
}) {
  return (
    <SkeletonGroup label={label} className="block">
      <ul className="bg-card divide-y rounded-xl border">
        {["40%", "28%", "48%"].map((width) => (
          <li
            key={width}
            className="flex items-start justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <SkeletonText width={width} />
              <SkeletonText width="70%" />
              <SkeletonText width="45%" />
            </div>
            {trailing}
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

export function BillingAddressesSkeleton() {
  return (
    <SettingsPage
      title="Billing addresses"
      meta="The addresses and GSTINs your Purchase Orders bill from. New orders start with the default."
    >
      <SettingsRowsSkeleton
        label="Loading billing addresses"
        trailing={<Skeleton className="size-8 shrink-0 rounded-lg" />}
      />
    </SettingsPage>
  );
}

export function SequenceIdsSkeleton() {
  return (
    <SettingsPage
      title="Sequence IDs"
      meta="How document numbers look. Numbers restart every 1 April when the fiscal year is part of them."
    >
      <div className="w-full max-w-sm space-y-1.5">
        <p className="text-sm leading-none font-medium">Module</p>
        <Skeleton aria-hidden="true" className="h-10 w-full rounded-lg" />
      </div>
      <SettingsRowsSkeleton
        label="Loading Sequence IDs"
        trailing={
          <div className="flex gap-2">
            <Skeleton className="h-10 w-12 rounded-lg" />
            <Skeleton className="h-10 w-16 rounded-lg" />
          </div>
        }
      />
    </SettingsPage>
  );
}
