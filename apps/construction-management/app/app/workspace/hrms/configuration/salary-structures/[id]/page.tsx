import type { Metadata } from "next";

import { EditSalaryStructureScreen } from "@/components/hrms/salary-structure-form";

export const metadata: Metadata = { title: "Edit salary structure" };

/** Configuration → Salary Structures → Edit (CM-314). */
export default async function EditSalaryStructurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditSalaryStructureScreen id={id} />;
}
