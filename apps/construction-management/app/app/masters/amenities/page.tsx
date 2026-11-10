import type { Metadata } from "next";

import { AmenitiesList } from "@/app/app/masters/_components/developments-list";

export const metadata: Metadata = { title: "Amenities" };

export default function AmenitiesPage() {
  return <AmenitiesList />;
}
