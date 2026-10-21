import type { Metadata } from "next";

import { NewItemScreen } from "@/components/contracts/items/item-form";

export const metadata: Metadata = { title: "Add Item" };

export default function NewItemPage() {
  return <NewItemScreen />;
}
