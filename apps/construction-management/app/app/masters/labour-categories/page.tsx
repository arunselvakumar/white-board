import type { Metadata } from "next";

import { LabourCategoriesList } from "@/app/app/masters/_components/lookup-list";

export const metadata: Metadata = { title: "Labour Categories" };

export default function LabourCategoriesPage() {
  return <LabourCategoriesList />;
}
