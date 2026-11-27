import type { Metadata } from "next";

import { NewLabourScreen } from "@/app/app/staff/labours/_components/labour-form";

export const metadata: Metadata = { title: "Add Labour" };

export default function NewLabourPage() {
  return <NewLabourScreen />;
}
