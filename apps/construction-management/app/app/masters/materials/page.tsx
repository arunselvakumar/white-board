import type { Metadata } from "next";

import { MaterialsList } from "@/components/masters/material-master-lists";

export const metadata: Metadata = { title: "Materials" };

export default function MaterialsPage() {
  return <MaterialsList />;
}
