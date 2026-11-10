import type { Metadata } from "next";

import { EnquiriesScreen } from "@/app/(app)/enquiries/_components/enquiries-screen";

export const metadata: Metadata = { title: "Enquiries" };

export default function EnquiriesPage() {
  return <EnquiriesScreen />;
}
