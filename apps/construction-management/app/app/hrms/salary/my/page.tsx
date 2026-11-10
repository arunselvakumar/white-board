import type { Metadata } from "next";
import { Suspense } from "react";

import { MySalarySkeleton } from "@/app/app/hrms/_components/hrms-skeletons";
import { MySalaryPage } from "@/app/app/hrms/salary/my/_components/my-salary-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/salary/my`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

export default function MySalaryRoute() {
  return (
    <Suspense fallback={<MySalarySkeleton />}>
      <MySalaryPage />
    </Suspense>
  );
}
