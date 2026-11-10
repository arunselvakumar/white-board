import type { Metadata } from "next";

import { CompanyBackupScreen } from "@/app/app/settings/backup/_components/company-backup-screen";

export const metadata: Metadata = { title: "Backup & export" };

export default function BackupSettingsPage() {
  return <CompanyBackupScreen />;
}
