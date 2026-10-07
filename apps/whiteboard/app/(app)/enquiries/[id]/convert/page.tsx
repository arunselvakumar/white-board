import type { Metadata } from "next";

import { ConvertEnquiryScreen } from "@/components/enquiries/convert-enquiry-screen";

export const metadata: Metadata = { title: "Convert to Student" };

export default async function ConvertEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConvertEnquiryScreen enquiryId={id} />;
}
