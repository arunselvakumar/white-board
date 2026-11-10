import type { DownloadItem, DownloadPage } from "@/src/queries/downloads";

export const DOWNLOADS_PATH = "/api/construction/reporting/downloads";
export const FIRST_PAGE_PATH = `${DOWNLOADS_PATH}?limit=20`;

const REPORTS = "/api/construction/reporting/reports";
const TOWER = "0190a000-0000-7000-8000-0000000000a1";

/** A report row as the route sends it; ready by default. */
export function downloadRow(
  overrides: Partial<Extract<DownloadItem, { source: "report" }>> & {
    id: string;
  },
): Extract<DownloadItem, { source: "report" }> {
  const status = overrides.status ?? "done";
  return {
    source: "report",
    kind: "labour_attendance",
    title: "All Labour Attendance",
    detail: "01 Oct 2026 to 09 Oct 2026",
    projectId: TOWER,
    projectName: "Tower A",
    status,
    error: null,
    createdAt: "2026-10-09T05:30:00.000Z",
    finishedAt: status === "queued" ? null : "2026-10-09T05:30:04.000Z",
    expiresAt: status === "done" ? "2026-11-08T05:30:04.000Z" : null,
    includesMoney: false,
    progressReport: false,
    files:
      status === "done"
        ? [
            {
              format: "xlsx",
              label: "Excel",
              href: `${REPORTS}/${overrides.id}/download?format=xlsx`,
            },
            {
              format: "pdf",
              label: "PDF",
              href: `${REPORTS}/${overrides.id}/download?format=pdf`,
            },
          ]
        : [],
    retryHref: status === "failed" ? `${REPORTS}/${overrides.id}/retry` : null,
    deleteHref: `${REPORTS}/${overrides.id}/delete`,
    ...overrides,
  };
}

export const READY = downloadRow({
  id: "0190a000-0000-7000-8000-0000000000d1",
});

export const GENERATING = downloadRow({
  id: "0190a000-0000-7000-8000-0000000000d2",
  kind: "muster_roll",
  title: "Muster roll and wage register",
  detail: "September 2026",
  status: "running",
  includesMoney: true,
});

export const FAILED = downloadRow({
  id: "0190a000-0000-7000-8000-0000000000d3",
  kind: "labour_payment",
  title: "All Labour Payment",
  status: "failed",
  error:
    "The report could not be generated. Try again; if it keeps failing, contact support.",
});

export const EXPIRED = downloadRow({
  id: "0190a000-0000-7000-8000-0000000000d4",
  title: "Vendor Attendance",
  kind: "vendor_attendance",
  detail: "01 Aug 2026 to 31 Aug 2026",
  status: "expired",
  createdAt: "2026-08-31T05:30:00.000Z",
});

export const CENTRAL = downloadRow({
  id: "0190a000-0000-7000-8000-0000000000d5",
  kind: "due_payments",
  title: "Due Payments",
  detail: "As on 09 Oct 2026",
  projectId: null,
  projectName: null,
  includesMoney: true,
});

export const DPR = downloadRow({
  id: "0190a000-0000-7000-8000-0000000000d6",
  kind: "daily_progress_report",
  title: "Daily Progress Report",
  detail: "DPR/26-27/00012 · 08 Oct 2026",
  progressReport: true,
  expiresAt: null,
  files: [
    {
      format: "pdf",
      label: "PDF",
      href: "/api/construction/site-work/progress-reports/0190a000-0000-7000-8000-0000000000d6/download",
    },
  ],
  deleteHref: null,
});

export function downloadsPage(
  items: DownloadItem[],
  nextCursor: string | null = null,
): DownloadPage {
  return { items, nextCursor };
}

const BACKUPS = "/api/construction/reporting/backups";

/** A backup row (CM-906) as the route sends it; ready by default. */
export function backupDownloadRow(
  overrides: Partial<Extract<DownloadItem, { source: "backup" }>> & {
    id: string;
  },
): Extract<DownloadItem, { source: "backup" }> {
  const status = overrides.status ?? "done";
  return {
    source: "backup",
    scope: "project",
    title: "Project backup",
    detail: "3 modules · 01 Sep 2026 to 30 Sep 2026",
    projectId: TOWER,
    projectName: "Tower A",
    status,
    error: null,
    createdAt: "2026-10-09T06:00:00.000Z",
    finishedAt: status === "queued" ? null : "2026-10-09T06:00:20.000Z",
    expiresAt: status === "done" ? "2026-10-16T06:00:20.000Z" : null,
    includesMoney: false,
    includeMedia: true,
    files:
      status === "done"
        ? [
            {
              format: "zip",
              label: "ZIP",
              href: `${BACKUPS}/${overrides.id}/download?expires=1792130420&sig=c2lnbmVk`,
            },
          ]
        : [],
    retryHref: null,
    deleteHref: `${BACKUPS}/${overrides.id}/delete`,
    ...overrides,
  };
}

export const BACKUP_READY = backupDownloadRow({
  id: "0190a000-0000-7000-8000-0000000000e1",
});

export const BACKUP_RUNNING = backupDownloadRow({
  id: "0190a000-0000-7000-8000-0000000000e2",
  scope: "company",
  title: "Full Company backup",
  detail: "Every Project, master records and settings",
  projectId: null,
  projectName: null,
  status: "running",
  includesMoney: true,
});

export const BACKUP_FAILED = backupDownloadRow({
  id: "0190a000-0000-7000-8000-0000000000e3",
  scope: "masters",
  title: "Master records backup",
  detail: "4 modules",
  projectId: null,
  projectName: null,
  status: "failed",
  error: "Too large — choose fewer modules or a shorter range",
});

export const BACKUP_EXPIRED = backupDownloadRow({
  id: "0190a000-0000-7000-8000-0000000000e4",
  status: "expired",
  createdAt: "2026-09-20T06:00:00.000Z",
});

export const DATA_EXPORT: DownloadItem = {
  source: "export",
  scope: "my_data",
  id: "0190a000-0000-7000-8000-0000000000e5",
  title: "My data",
  detail: "Your profile, Companies and activity",
  projectId: null,
  projectName: null,
  status: "done",
  error: null,
  createdAt: "2026-10-09T07:00:00.000Z",
  finishedAt: "2026-10-09T07:00:03.000Z",
  expiresAt: "2026-10-16T07:00:03.000Z",
  files: [
    {
      format: "zip",
      label: "ZIP",
      href: `${BACKUPS}/0190a000-0000-7000-8000-0000000000e5/download?expires=1792134003&sig=bXlkYXRh`,
    },
  ],
  retryHref: null,
  deleteHref: `${BACKUPS}/0190a000-0000-7000-8000-0000000000e5/delete`,
};
