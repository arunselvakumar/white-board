import type { Metadata } from "next";

import { GrnFieldsForm } from "@/components/settings/grn-fields-form";

export const metadata: Metadata = { title: "GRN fields" };

export default function GrnFieldsPage() {
  return <GrnFieldsForm />;
}
