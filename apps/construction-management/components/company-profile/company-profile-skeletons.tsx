import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

import { PageHeader } from "@/components/app-shell/page-header";

/** Masters → Company profile while it loads (ADR-0047). */
export function CompanyProfileSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Company profile"
          meta="How your Company appears on documents and to your team."
        />
        <SkeletonGroup
          label="Loading Company profile"
          className="block space-y-8"
        >
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Logo</h2>
              <p className="text-muted-foreground text-sm">
                Printed on your Purchase Orders, invoices and reports.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="size-20 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
                <SkeletonText size="xs" width="16rem" />
              </div>
            </div>
          </section>
          <div className="bg-border h-px w-full" />
          <FormSkeleton
            columns={2}
            fields={[
              { label: "Company name" },
              { label: "Company mobile" },
              { label: "Company email" },
              { label: "GSTIN" },
              { label: "Company PAN" },
              { label: "Address", control: "textarea", wide: true },
              { label: "Country", control: "select" },
              { label: "Currency", control: "select" },
              { label: "Time zone", control: "select" },
            ]}
          />
        </SkeletonGroup>
      </div>
    </div>
  );
}
