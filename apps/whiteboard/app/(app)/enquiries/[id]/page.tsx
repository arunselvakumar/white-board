import type { Metadata } from "next";

import { EnquiryDetailScreen } from "@/components/enquiries/enquiry-detail-screen";

export const metadata: Metadata = { title: "Enquiry" };

export default async function EnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnquiryDetailScreen enquiryId={id} />;
}
