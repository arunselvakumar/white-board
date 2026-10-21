import type { Metadata } from "next";

import { NewClientScreen } from "@/components/masters/clients/client-form";

export const metadata: Metadata = { title: "Add Client" };

export default function NewClientPage() {
  return <NewClientScreen />;
}
