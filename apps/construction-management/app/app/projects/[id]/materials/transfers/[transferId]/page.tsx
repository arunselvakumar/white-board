import type { Metadata } from "next";

import { ProjectTransferDetail } from "@/components/procurement/transfers/project-transfer-pages";

export const metadata: Metadata = { title: "Material Transfer" };

/** One Material Transfer (CM-507); the route checks Read on either side. */
export default async function ProjectTransferRoute({
  params,
}: {
  params: Promise<{ id: string; transferId: string }>;
}) {
  const { id, transferId } = await params;
  return <ProjectTransferDetail projectId={id} transferId={transferId} />;
}
