import { redirect } from "next/navigation";

import { inquiryModulePath } from "@/components/sales/inquiries/inquiry-tabs";

/** The Inquiries module opens on its list (M10). */
export default async function InquiriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(inquiryModulePath(id, "list"));
}
