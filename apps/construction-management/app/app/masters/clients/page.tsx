import type { Metadata } from "next";

import { ClientsPage } from "@/components/masters/clients/clients-page";

export const metadata: Metadata = { title: "Clients" };

/** Master records → Clients (CM-1101). */
export default function ClientsMasterPage() {
  return <ClientsPage />;
}
