import type { Metadata } from "next";

import { EditStorePage } from "@/components/procurement/stores/edit-store-page";

export const metadata: Metadata = { title: "Edit store" };

export default async function EditStoreRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditStorePage storeId={id} />;
}
