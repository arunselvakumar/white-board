import type { Metadata } from "next";

import { CentreCreateScreen } from "@/app/(app)/preschool/centres/new/_components/centre-create-screen";

export const metadata: Metadata = { title: "Add Centre" };

export default function NewCentrePage() {
  return <CentreCreateScreen />;
}
