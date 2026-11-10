import type { Metadata } from "next";

import { EditSalaryStructureScreen } from "@/app/app/hrms/configuration/_components/salary-structure-form";

export const metadata: Metadata = { title: "Edit salary structure" };

export default async function EditSalaryStructurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditSalaryStructureScreen id={id} />;
}
