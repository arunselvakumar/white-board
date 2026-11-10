import type { Metadata } from "next";

import { MaterialsList } from "@/app/app/masters/_components/material-master-lists";

export const metadata: Metadata = { title: "Materials" };

export default function MaterialsPage() {
  return <MaterialsList />;
}
