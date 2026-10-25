import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonText } from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

/*
 * Pieces Sales forms share while they load (ADR-0047). The kit's
 * `FormSkeleton` has a fixed `gap-5`, one or two columns and h-9 controls;
 * these forms use `gap-4`, up to three columns and the h-8 `Input`.
 */

export type SalesSkeletonField = {
  label: string;
  /** "textarea" with its rows, or a one-line control. */
  rows?: number;
  /** Grid span classes of the loaded field, e.g. "sm:col-span-2". */
  className?: string;
};

/** Label and control pairs in the loaded form's own grid. */
export function FieldGridSkeleton({
  fields,
  className,
}: {
  fields: SalesSkeletonField[];
  className: string;
}) {
  return (
    <div className={className}>
      {fields.map((field) => (
        <div key={field.label} className={cn("space-y-1.5", field.className)}>
          <span className="block text-sm leading-none font-medium">
            {field.label}
          </span>
          <Skeleton
            className={cn(
              "w-full rounded-lg",
              field.rows == null ? "h-8" : field.rows >= 3 ? "h-20" : "h-16",
            )}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * `SiteRecordHeader` while it loads. With `title` the heading is real;
 * without, a record's name is data and both the back label and the title
 * are bars.
 */
export function RecordHeaderSkeleton({
  back,
  title,
}: {
  back: { label?: string; href: string };
  title?: string;
}) {
  return (
    <div className="space-y-3">
      <Link
        href={back.href}
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label ?? <SkeletonText width="6rem" />}
      </Link>
      <h2 className="text-lg font-semibold break-words">
        {title ?? (
          <>
            <span className="sr-only">Loading</span>
            <SkeletonText size="lg" width="min(14rem, 70vw)" />
          </>
        )}
      </h2>
    </div>
  );
}

/** A form's Cancel and Save buttons. */
export function FormActionsSkeleton() {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Skeleton className="h-10 w-20 rounded-lg" />
      <Skeleton className="h-10 w-16 rounded-lg" />
    </div>
  );
}
