import type { Metadata } from "next";

import { EditLabourScreen } from "@/components/labours/labour-form";

export const metadata: Metadata = { title: "Edit Labour" };

export default async function EditLabourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditLabourScreen id={id} />;
}
