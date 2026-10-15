import type { Metadata } from "next";

import { IssueCategoriesList } from "@/components/masters/tracking-master-lists";

export const metadata: Metadata = { title: "Issue Categories" };

/** Masters → Issue Categories (CM-801). */
export default function IssueCategoriesPage() {
  return <IssueCategoriesList />;
}
