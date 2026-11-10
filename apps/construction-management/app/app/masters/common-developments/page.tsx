import type { Metadata } from "next";

import { CommonDevelopmentsList } from "@/app/app/masters/_components/developments-list";

export const metadata: Metadata = { title: "Common Developments" };

export default function CommonDevelopmentsPage() {
  return <CommonDevelopmentsList />;
}
