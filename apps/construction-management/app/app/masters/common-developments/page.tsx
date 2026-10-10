import type { Metadata } from "next";

import { CommonDevelopmentsList } from "@/components/masters/developments-list";

export const metadata: Metadata = { title: "Common Developments" };

export default function CommonDevelopmentsPage() {
  return <CommonDevelopmentsList />;
}
