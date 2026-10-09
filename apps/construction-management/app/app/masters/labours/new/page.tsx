import type { Metadata } from "next";

import { NewLabourScreen } from "@/components/labours/labour-form";

export const metadata: Metadata = { title: "Add Labour" };

export default function NewLabourPage() {
  return <NewLabourScreen />;
}
