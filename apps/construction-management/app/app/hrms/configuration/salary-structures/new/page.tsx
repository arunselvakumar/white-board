import type { Metadata } from "next";

import { NewSalaryStructureScreen } from "@/app/app/hrms/configuration/_components/salary-structure-form";

export const metadata: Metadata = { title: "Add salary structure" };

export default function NewSalaryStructurePage() {
  return <NewSalaryStructureScreen />;
}
