import { CalendarCheck, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";

import { newVisitPath } from "@/src/queries/marketing-visits";

/**
 * Plan Visit, and Log Visit for one already made (completed); from a
 * company's page, with that company picked.
 */
export function VisitButtons({
  prospectCompanyId,
}: {
  prospectCompanyId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={newVisitPath("completed", prospectCompanyId)}
        className={buttonVariants({ variant: "outline" })}
      >
        <CalendarCheck aria-hidden="true" />
        Log Visit
      </Link>
      <Link
        href={newVisitPath("planned", prospectCompanyId)}
        className={buttonVariants()}
      >
        <CalendarPlus aria-hidden="true" />
        Plan Visit
      </Link>
    </div>
  );
}
