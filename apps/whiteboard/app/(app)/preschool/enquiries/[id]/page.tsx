import type { Metadata } from "next";

import { EnquiryDetailScreen } from "@/app/(app)/preschool/enquiries/[id]/_components/enquiry-detail-screen";

export const metadata: Metadata = { title: "Enquiry" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnquiryDetailScreen enquiryId={id} />;
}
