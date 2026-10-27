import type { Metadata } from "next";

import { LaboursPage } from "@/components/labours/labours-page";

export const metadata: Metadata = { title: "Labours" };

export default function Page() {
  return <LaboursPage />;
}
