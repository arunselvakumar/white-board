import type { Metadata } from "next";

import { LaboursPage } from "@/app/app/staff/labours/_components/labours-page";

export const metadata: Metadata = { title: "Labours" };

export default function Page() {
  return <LaboursPage />;
}
