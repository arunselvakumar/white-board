import type { Metadata } from "next";

import { ProjectTransferEdit } from "@/components/procurement/transfers/project-transfer-pages";

export const metadata: Metadata = { title: "Edit Material Transfer" };

/** Edit a pending Material Transfer (CM-507). */
export default async function ProjectTransferEditRoute({
  params,
}: {
  params: Promise<{ id: string; transferId: string }>;
}) {
  const { id, transferId } = await params;
  return <ProjectTransferEdit projectId={id} transferId={transferId} />;
}
