import type { Metadata } from "next";

import { DownloadsPage } from "@/components/downloads/downloads-page";

export const metadata: Metadata = { title: "Downloads" };

/** The member's reports across Projects (CM-901), from the user menu. */
export default function Downloads() {
  return <DownloadsPage />;
}
