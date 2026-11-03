import type { Metadata } from "next";

import { LabourCategoriesList } from "@/components/masters/lookup-list";

export const metadata: Metadata = { title: "Labour Categories" };

export default function LabourCategoriesPage() {
  return <LabourCategoriesList />;
}
