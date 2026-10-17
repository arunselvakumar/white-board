import type { Metadata } from "next";

import { CompanyBackupScreen } from "@/components/backups/company-backup-screen";

export const metadata: Metadata = { title: "Backup & export" };

export default function BackupSettingsPage() {
  return <CompanyBackupScreen />;
}
