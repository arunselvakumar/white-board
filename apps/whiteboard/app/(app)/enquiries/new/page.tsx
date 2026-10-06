import type { Metadata } from "next";

import { EnquiryCreateScreen } from "@/components/enquiries/enquiry-create-screen";

export const metadata: Metadata = { title: "Add enquiry" };

export default function NewEnquiryPage() {
  return <EnquiryCreateScreen />;
}
