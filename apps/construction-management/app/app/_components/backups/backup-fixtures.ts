import type { Backup, BackupModuleOption } from "@/src/queries/backups";

export const BACKUPS = "/api/construction/reporting/backups";
export const TOWER = "0190a000-0000-7000-8000-0000000000a1";
export const BACKUP_ID = "0190a000-0000-7000-8000-0000000000f1";

/** A backup as the routes send it; queued by default. */
export function backupResponse(overrides: Partial<Backup> = {}): Backup {
  const status = overrides.status ?? "queued";
  const done = status === "done";
  return {
    id: BACKUP_ID,
    scope: "project",
    title: "Project backup",
    detail: "2 modules · All dates",
    projectId: TOWER,
    projectName: "Tower A",
    modules: [
      { key: "site_work.daily_worksheet", label: "Daily Worksheets" },
      { key: "site_work.equipment_usage", label: "Equipment Usage" },
    ],
    from: null,
    to: null,
    includeData: true,
    includeMedia: false,
    includesMoney: false,
    status,
    partsDone: done ? 2 : 0,
    partsTotal: 2,
    error: null,
    fileName: done ? "project-backup-2026-10-16.zip" : null,
    bytes: done ? 1_288_490 : null,
    createdAt: "2026-10-16T06:00:00.000Z",
    finishedAt: done ? "2026-10-16T06:00:20.000Z" : null,
    expiresAt: done ? "2026-10-23T06:00:20.000Z" : null,
    downloadHref: done
      ? `${BACKUPS}/${overrides.id ?? BACKUP_ID}/download?expires=1792735220&sig=c2lnbmVk`
      : null,
    deleteHref: `${BACKUPS}/${overrides.id ?? BACKUP_ID}/delete`,
    ...overrides,
  };
}

export const PROJECT_MODULES: BackupModuleOption[] = [
  {
    key: "projects.project",
    label: "Project details",
    group: "Project",
    includesMoney: false,
    hasMedia: false,
  },
  {
    key: "site_work.daily_worksheet",
    label: "Daily Worksheets",
    group: "Daily Work",
    includesMoney: false,
    hasMedia: true,
  },
  {
    key: "site_work.equipment_usage",
    label: "Equipment Usage",
    group: "Daily Work",
    includesMoney: true,
    hasMedia: true,
  },
  {
    key: "procurement.purchase_orders",
    label: "Purchase Orders",
    group: "Materials",
    includesMoney: true,
    hasMedia: true,
  },
];

export const MASTER_MODULES: BackupModuleOption[] = [
  {
    key: "masters.contractors",
    label: "Contractors",
    group: "Master records",
    includesMoney: false,
    hasMedia: false,
  },
  {
    key: "masters.materials",
    label: "Materials",
    group: "Master records",
    includesMoney: true,
    hasMedia: false,
  },
];
