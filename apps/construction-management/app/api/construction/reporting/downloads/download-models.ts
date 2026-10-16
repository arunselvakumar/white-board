import { z } from "zod";

import { REPORT_KINDS } from "@/src/reporting/domain/report-job";

export const DOWNLOADS_PATH = "/api/construction/reporting/downloads";

/**
 * Downloads (ADR CM-0021 §2, CM-901): the signed-in member's own files
 * waiting to be downloaded, across Projects, newest first.
 *
 * HOW TO ADD A SOURCE (CM-906 adds `backup` and `export`):
 * 1. Add `"backup"` to `DOWNLOAD_SOURCES` below and a variant to
 *    `ConstructionReportingDownloadItemModel`: `DownloadItemBase.extend({
 *    source: z.literal("backup"), …its own fields })`. Keep everything a
 *    row shows in the base fields (title, detail, status, files and the
 *    retry / delete links); a variant only adds what is specific to it.
 * 2. Write a `DownloadSource` (`./download-sources.ts`) that returns the
 *    member's rows newest first before the cursor, and append it to
 *    `downloadSources()` there. The route merges every source by
 *    `createdAt` and `id`, so paging needs nothing else.
 * 3. The UI row (`components/downloads/download-row.tsx`) renders the base
 *    fields of any source; give the source a label in its
 *    `SOURCE_LABELS` (a missing one is a type error).
 */
export const DOWNLOAD_SOURCES = ["report", "backup", "export"] as const;

export type DownloadSourceKey = (typeof DOWNLOAD_SOURCES)[number];

// Requests

export const ListConstructionReportingDownloadsRequestModel = z.object({
  /** `nextCursor` of the page before. */
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Responses

const DownloadFileModel = z.object({
  format: z.enum(["xlsx", "pdf", "zip"]),
  /** "Excel", "PDF", "ZIP". */
  label: z.string(),
  /** Our route, which checks access again; never a storage URL. */
  href: z.string(),
});

/** What every row has, whatever its source. */
const DownloadItemBase = z.object({
  id: z.uuid(),
  title: z.string(),
  /** What it covers: "01 Sep 2026 to 30 Sep 2026", "September 2026". */
  detail: z.string(),
  /** Null for a central report (every Project). */
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  status: z.enum(["queued", "running", "done", "failed", "expired"]),
  /** Why it failed, in words a screen can show. */
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** When retention deletes its files; null when they are kept until deleted. */
  expiresAt: z.iso.datetime().nullable(),
  /** Download links while it is done and the viewer may open it. */
  files: z.array(DownloadFileModel),
  /** POST here to run a failed one again; null when not allowed. */
  retryHref: z.string().nullable(),
  /** POST here to delete it; null when not allowed. */
  deleteHref: z.string().nullable(),
});

export const ConstructionReportingDownloadItemModel = z.discriminatedUnion(
  "source",
  [
    DownloadItemBase.extend({
      source: z.literal("report"),
      kind: z.enum(REPORT_KINDS),
      /** The files carry amounts. */
      includesMoney: z.boolean(),
      /** A Daily or Task Progress Report (kept until deleted). */
      progressReport: z.boolean(),
    }),
    // CM-906: backups (Project, master records, full Company).
    DownloadItemBase.extend({
      source: z.literal("backup"),
      scope: z.enum(["project", "masters", "company"]),
      /** The ZIP carries amounts. */
      includesMoney: z.boolean(),
      includeMedia: z.boolean(),
    }),
    // CM-906: Download My Data.
    DownloadItemBase.extend({
      source: z.literal("export"),
      scope: z.literal("my_data"),
    }),
  ],
);

export type ConstructionReportingDownloadItemModel = z.infer<
  typeof ConstructionReportingDownloadItemModel
>;

export const ListConstructionReportingDownloadsResponseModel = z.object({
  items: z.array(ConstructionReportingDownloadItemModel),
  /** Pass as `cursor` for the next page; null on the last. */
  nextCursor: z.string().nullable(),
});

export type ListConstructionReportingDownloadsResponseModel = z.infer<
  typeof ListConstructionReportingDownloadsResponseModel
>;

/** A page position: the last row's time and id. */
export type DownloadCursor = { createdAt: Date; id: string };

export function encodeDownloadCursor(cursor: DownloadCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

/** Null for a cursor that is not ours. */
export function decodeDownloadCursor(value: string): DownloadCursor | null {
  const [at, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
  const createdAt = new Date(at ?? "");
  if (Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success)
    return null;
  return { createdAt, id: id ?? "" };
}
