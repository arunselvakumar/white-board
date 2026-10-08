import type { Metadata } from "next";

import { NewDesignationScreen } from "@/components/designations/designation-form";

export const metadata: Metadata = { title: "Add Designation" };

export default function NewDesignationPage() {
  return <NewDesignationScreen />;
}
