import type { Metadata } from "next";

import { MaterialCategoriesList } from "@/app/app/masters/_components/material-master-lists";

export const metadata: Metadata = { title: "Material Categories" };

export default function MaterialCategoriesPage() {
  return <MaterialCategoriesList />;
}
