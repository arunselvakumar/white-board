import type { Metadata } from "next";

import { EnquiriesScreen } from "@/components/enquiries/enquiries-screen";

export const metadata: Metadata = { title: "Enquiries" };

export default function EnquiriesPage() {
  return <EnquiriesScreen />;
}
