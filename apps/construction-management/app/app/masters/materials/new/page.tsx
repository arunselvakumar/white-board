import type { Metadata } from "next";

import { NewMaterialScreen } from "@/components/masters/material-form";

export const metadata: Metadata = { title: "Add Material" };

export default function NewMaterialPage() {
  return <NewMaterialScreen />;
}
