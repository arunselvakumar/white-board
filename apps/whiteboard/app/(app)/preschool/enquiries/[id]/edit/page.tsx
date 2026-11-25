import type { Metadata } from "next";

import { EnquiryEditScreen } from "@/app/(app)/preschool/enquiries/[id]/edit/_components/enquiry-edit-screen";

export const metadata: Metadata = { title: "Edit Enquiry" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnquiryEditScreen enquiryId={id} />;
}
