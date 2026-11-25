import type { Metadata } from "next";

import { EnquiryCreateScreen } from "@/app/(app)/preschool/enquiries/new/_components/enquiry-create-screen";

export const metadata: Metadata = { title: "Add Enquiry" };

export default function Page() {
  return <EnquiryCreateScreen />;
}
