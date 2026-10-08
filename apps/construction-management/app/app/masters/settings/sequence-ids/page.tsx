import type { Metadata } from "next";

import { SequenceIdsManager } from "@/components/settings/sequence-ids-manager";

export const metadata: Metadata = { title: "Sequence IDs" };

export default function SequenceIdsPage() {
  return <SequenceIdsManager />;
}
