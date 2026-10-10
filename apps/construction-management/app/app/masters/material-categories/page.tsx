import type { Metadata } from "next";

import { MaterialCategoriesList } from "@/components/masters/material-master-lists";

export const metadata: Metadata = { title: "Material Categories" };

export default function MaterialCategoriesPage() {
  return <MaterialCategoriesList />;
}
