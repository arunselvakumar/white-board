import type { Metadata } from "next";

import { MeasurementUnitsList } from "@/app/app/masters/_components/material-master-lists";

export const metadata: Metadata = { title: "Measurement Units" };

export default function MeasurementUnitsPage() {
  return <MeasurementUnitsList />;
}
