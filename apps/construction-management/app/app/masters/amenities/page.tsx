import type { Metadata } from "next";

import { AmenitiesList } from "@/components/masters/developments-list";

export const metadata: Metadata = { title: "Amenities" };

export default function AmenitiesPage() {
  return <AmenitiesList />;
}
