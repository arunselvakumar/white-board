import type { Metadata } from "next";
import { Suspense } from "react";

import { MySalarySkeleton } from "@/components/hrms/hrms-skeletons";
import { MySalaryPage } from "@/components/hrms/salary/my-salary-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/salary/my`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** My Salary (CM-317). */
export default function MySalaryRoute() {
  return (
    <Suspense fallback={<MySalarySkeleton />}>
      <MySalaryPage />
    </Suspense>
  );
}
