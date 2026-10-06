import type { Metadata } from "next";

import { EnquirySourcesScreen } from "@/components/enquiries/enquiry-sources-screen";

export const metadata: Metadata = { title: "Enquiry Sources" };

export default function EnquirySourcesPage() {
  return <EnquirySourcesScreen />;
}
