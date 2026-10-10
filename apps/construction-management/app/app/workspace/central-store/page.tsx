import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { StoresPage } from "@/components/procurement/stores/stores-page";

export const metadata: Metadata = { title: "Central Store" };

/** Workspace → Central Store: the Company's stores (CM-508). */
export default async function CentralStoreRoute() {
  if (!(await viewerCan("procurement.central_store", "read")))
    return <ProjectNoAccess what="Central Store" />;
  return <StoresPage />;
}
