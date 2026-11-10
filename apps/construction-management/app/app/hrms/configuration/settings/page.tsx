import type { Metadata } from "next";

import { HrmsSettingsForm } from "@/app/app/hrms/configuration/settings/_components/hrms-settings-form";

export const metadata: Metadata = { title: "HRMS Settings" };

export default function HrmsSettingsPage() {
  return <HrmsSettingsForm />;
}
