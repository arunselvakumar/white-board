import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { MySalaryPage } from "@/components/hrms/salary/my-salary-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/salary/my`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** My Salary (CM-317). */
export default function MySalaryRoute() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-2 p-6" aria-busy="true">
          <Skeleton className="h-16 w-full max-w-4xl" />
          <Skeleton className="h-16 w-full max-w-4xl" />
        </div>
      }
    >
      <MySalaryPage />
    </Suspense>
  );
}
