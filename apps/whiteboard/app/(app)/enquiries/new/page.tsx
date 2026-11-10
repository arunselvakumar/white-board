import type { Metadata } from "next";

import { EnquiryCreateScreen } from "@/app/(app)/enquiries/new/_components/enquiry-create-screen";

export const metadata: Metadata = { title: "Add enquiry" };

export default function NewEnquiryPage() {
  return <EnquiryCreateScreen />;
}
