import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { MARKETING_COMPANIES_PATH } from "@/lib/marketing-nav";

/**
 * Whether a prefetch failed because the company is not there for the
 * viewer: a `QueryHttpError` 404, checked by name, not `instanceof`, as
 * `isPrismaError` does for bundled copies of a class.
 */
export function isCompanyNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "QueryHttpError" &&
    (error as { status?: unknown }).status === 404
  );
}

/**
 * A deleted company, another Company's, or one the viewer may not see
 * (ADR CM-0040 §5): the same words, so its existence is not confirmed.
 */
export function CompanyNotFound() {
  return (
    <div className="w-full max-w-4xl p-6">
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>This Prospect Company was not found</EmptyTitle>
          <EmptyDescription>
            It may have been deleted, or it is not one of yours.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href={MARKETING_COMPANIES_PATH}
            className={buttonVariants({ variant: "outline" })}
          >
            Back to Prospect Companies
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  );
}
