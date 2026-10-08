import type { Metadata } from "next";

import { DesignationsList } from "@/components/designations/designations-list";

export const metadata: Metadata = { title: "Designations" };

export default function DesignationsPage() {
  return <DesignationsList />;
}
