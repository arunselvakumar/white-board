import type { Metadata } from "next";

import { EditMaterialScreen } from "@/components/masters/material-form";

export const metadata: Metadata = { title: "Edit Material" };

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditMaterialScreen id={id} />;
}
