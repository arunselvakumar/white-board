import type { Metadata } from "next";

import { IssueCategoriesList } from "@/app/app/masters/_components/tracking-master-lists";

export const metadata: Metadata = { title: "Issue Categories" };

/** Masters → Issue Categories (CM-801). */
export default function IssueCategoriesPage() {
  return <IssueCategoriesList />;
}
