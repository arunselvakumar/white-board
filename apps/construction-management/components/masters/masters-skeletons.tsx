import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

import {
  PageHeader,
  type PageHeaderBack,
} from "@/components/app-shell/page-header";
import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";

/*
 * Masters lists while they load (ADR-0047): the real page header, then
 * rows shaped like `MasterRow` in the same bordered card list.
 */

const NAME_WIDTHS = ["42%", "28%", "55%", "36%", "48%", "31%"];
const DETAIL_WIDTHS = ["30%", "46%", "24%", "38%", "27%", "41%"];

/** The page's Add button, shown but inert until the list arrives. */
export function MasterAddButtonSkeleton({ label }: { label: string }) {
  return (
    <Button type="button" disabled>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  );
}

/** Rows shaped like `MasterRow`: name, an optional detail line, the row menu. */
export function MasterRowsSkeleton({
  rows = 5,
  details = false,
  count = false,
  search = false,
  label = "Loading",
}: {
  rows?: number;
  details?: boolean;
  /** The "N items" line paged lists show above the rows. */
  count?: boolean;
  /** The search box name-only lists show once they have rows. */
  search?: boolean;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className="block space-y-3">
      {search ? (
        <Skeleton className="h-8 w-full rounded-lg sm:max-w-xs" />
      ) : null}
      {count ? <SkeletonText width="5rem" /> : null}
      <ul className="bg-card divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <SkeletonText
                size="base"
                width={NAME_WIDTHS[row % NAME_WIDTHS.length]}
              />
              {details ? (
                <SkeletonText
                  width={DETAIL_WIDTHS[row % DETAIL_WIDTHS.length]}
                />
              ) : null}
            </div>
            <Skeleton className="size-8 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/**
 * A masters list page whose rows and header load together: the real
 * header (title, description, Add), then the search box and rows.
 */
export function MasterListPageSkeleton({
  title,
  meta,
  actions,
  details = false,
  back = { label: "Masters", href: "/app/masters" },
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  details?: boolean;
  /** Null for a page with no back link (a main-menu page). */
  back?: PageHeaderBack | null;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={back ?? undefined}
          title={title}
          meta={meta}
          actions={actions}
        />
        <MasterRowsSkeleton
          search
          details={details}
          label={`Loading ${title}`}
        />
      </div>
    </div>
  );
}

/**
 * An add or edit page while its record loads: the real back link, the
 * title (a bar when it is data, "Edit Ramesh"), then the form's skeleton.
 */
export function FormPageSkeleton({
  back,
  title,
  meta = false,
  className = "max-w-4xl",
  children,
}: {
  back: PageHeaderBack;
  /** The real title when it is known; a bar otherwise. */
  title?: string;
  /** A meta line under a title that is data. */
  meta?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className={cn("w-full space-y-6", className)}>
        {title == null ? (
          <PageHeaderSkeleton back={back} meta={meta} />
        ) : (
          <PageHeader back={back} title={title} />
        )}
        {children}
      </div>
    </div>
  );
}

/** A form section's real heading and description over its fields' skeleton. */
export function FormSectionSkeleton({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        {description == null ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** A `grid gap-2 sm:grid-cols-2` checklist of Projects, as forms show them. */
export function ChecklistSkeleton({
  rows = 4,
  label = "Loading Projects",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className="grid gap-2 sm:grid-cols-2">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
        >
          <Skeleton className="size-4 shrink-0 rounded-[4px]" />
          <SkeletonText width={NAME_WIDTHS[row % NAME_WIDTHS.length]} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Add or Edit Material while the Material (and the viewer's rights) load. */
export function MaterialFormSkeleton({ title }: { title?: string }) {
  return (
    <FormPageSkeleton
      back={{ label: "Materials", href: "/app/masters/materials" }}
      title={title}
    >
      <div className="space-y-8">
        <FormSectionSkeleton title="Details">
          <FormSkeleton
            columns={2}
            label="Loading Material"
            fields={[
              { label: "Material name" },
              { label: "Item Type", control: "select" },
              { label: "Measurement Unit", control: "select" },
              { label: "Material Category", control: "select" },
              { label: "Specification", control: "textarea", wide: true },
              { label: "Minimum Stock", control: "checkbox", wide: true },
              { label: "Rate Details", control: "checkbox", wide: true },
            ]}
          />
        </FormSectionSkeleton>
      </div>
    </FormPageSkeleton>
  );
}
