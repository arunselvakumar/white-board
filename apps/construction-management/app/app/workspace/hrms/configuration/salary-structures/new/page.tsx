import type { Metadata } from "next";

import { NewSalaryStructureScreen } from "@/components/hrms/salary-structure-form";

export const metadata: Metadata = { title: "Add salary structure" };

/** Configuration → Salary Structures → Add (CM-314). */
export default function NewSalaryStructurePage() {
  return <NewSalaryStructureScreen />;
}
