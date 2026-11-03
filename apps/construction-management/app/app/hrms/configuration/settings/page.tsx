import type { Metadata } from "next";

import { HrmsSettingsForm } from "@/components/hrms/hrms-settings-form";

export const metadata: Metadata = { title: "HRMS Settings" };

/** Configuration → Settings (CM-303). */
export default function HrmsSettingsPage() {
  return <HrmsSettingsForm />;
}
