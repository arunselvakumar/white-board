import type { Metadata } from "next";

import { ItemsPage } from "@/components/contracts/items/items-page";

export const metadata: Metadata = { title: "Item Library" };

/** Master records → Item Library (CM-1102). */
export default function ItemLibraryPage() {
  return <ItemsPage />;
}
