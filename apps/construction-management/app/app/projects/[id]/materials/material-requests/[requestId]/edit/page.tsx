import type { Metadata } from "next";

import { EditMaterialRequestPage } from "@/components/procurement/material-requests/edit-material-request-page";

export const metadata: Metadata = { title: "Edit Material Request" };

export default async function EditMaterialRequestRoute({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  return <EditMaterialRequestPage projectId={id} requestId={requestId} />;
}
