import type { Metadata } from "next";

import { EditItemScreen } from "@/components/contracts/items/item-form";

export const metadata: Metadata = { title: "Edit Item" };

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditItemScreen id={id} />;
}
