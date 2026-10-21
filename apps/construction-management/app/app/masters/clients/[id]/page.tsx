import type { Metadata } from "next";

import { EditClientScreen } from "@/components/masters/clients/client-form";

export const metadata: Metadata = { title: "Edit Client" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditClientScreen id={id} />;
}
