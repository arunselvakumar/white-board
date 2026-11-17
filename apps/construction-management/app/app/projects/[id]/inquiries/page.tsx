import { redirect } from "next/navigation";

import { pageHref } from "@/lib/page-href";

/** The Inquiries module opens on its list. */
export default async function InquiriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(pageHref("/app/projects/[id]/inquiries/list", { id }));
}
