import type { ReactNode } from "react";

import { HrmsShell } from "@/components/hrms/hrms-shell";

/** The HRMS shell around every HRMS page (M3). */
export default function HrmsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <HrmsShell>{children}</HrmsShell>;
}
