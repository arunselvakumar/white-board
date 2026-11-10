import type { Metadata } from "next";

import { EnquirySourcesScreen } from "@/app/(app)/enquiries/sources/_components/enquiry-sources-screen";

export const metadata: Metadata = { title: "Enquiry Sources" };

export default function EnquirySourcesPage() {
  return <EnquirySourcesScreen />;
}
