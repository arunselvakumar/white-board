import type { Metadata } from "next";

import { MaterialRequestDetail } from "@/components/procurement/material-requests/material-request-detail";

export const metadata: Metadata = { title: "Material Request" };

/** One Material Request of the Project. */
export default async function MaterialRequestRoute({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <MaterialRequestDetail requestId={requestId} side="project" />;
}
