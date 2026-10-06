import type { Metadata } from "next";

import { EnquiryEditScreen } from "@/components/enquiries/enquiry-edit-screen";

export const metadata: Metadata = { title: "Edit enquiry" };

export default async function EditEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnquiryEditScreen enquiryId={id} />;
}
