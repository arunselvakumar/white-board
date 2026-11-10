import type { Metadata } from "next";

import { TagsList } from "@/app/app/masters/_components/tracking-master-lists";

export const metadata: Metadata = { title: "Tags" };

/** Masters → Tags (CM-801). */
export default function TagsPage() {
  return <TagsList />;
}
