import type { ReactNode } from "react";

import { HrmsShell } from "@/app/app/hrms/_components/hrms-shell";

export default function HrmsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <HrmsShell>{children}</HrmsShell>;
}
