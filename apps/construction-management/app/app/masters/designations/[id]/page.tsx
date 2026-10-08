import type { Metadata } from "next";

import { EditDesignationScreen } from "@/components/designations/designation-form";

export const metadata: Metadata = { title: "Edit Designation" };

export default async function EditDesignationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditDesignationScreen id={id} />;
}
