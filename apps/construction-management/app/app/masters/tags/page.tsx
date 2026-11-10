import type { Metadata } from "next";

import { TagsList } from "@/app/app/masters/_components/tracking-master-lists";

export const metadata: Metadata = { title: "Tags" };

export default function TagsPage() {
  return <TagsList />;
}
