import { z } from "zod";

export const BACKUPS_PATH = "/api/construction/reporting/backups";

const CalendarDate = z.iso.date();

const ModuleKeys = z.array(z.string().min(1).max(80)).min(1).max(80);

// Requests

/**
 * A backup request (ADR CM-0021 §8), by scope:
 * - `project`: chosen modules of one Project, a date range, data and/or media;
 * - `masters`: chosen master records;
 * - `company`: everything, Owner only, with the `company_backup` code;
 * - `my_data`: the signed-in User's own data (Download My Data).
 */
export const CreateConstructionReportingBackupRequestModel =
  z.discriminatedUnion("scope", [
    z.object({
      scope: z.literal("project"),
      projectId: z.uuid(),
      modules: ModuleKeys,
      from: CalendarDate.optional(),
      to: CalendarDate.optional(),
      includeData: z.boolean().default(true),
      includeMedia: z.boolean().default(false),
    }),
    z.object({
      scope: z.literal("masters"),
      modules: ModuleKeys,
    }),
    z.object({
      scope: z.literal("company"),
      /** The six-digit code sent with purpose `company_backup`. */
      code: z.string().regex(/^\d{6}$/),
      includeMedia: z.boolean().default(false),
      /**
       * HRMS modules only (Settings → Backup & export → HRMS); left out,
       * the backup holds every module of the Company.
       */
      modules: ModuleKeys.optional(),
    }),
    z.object({ scope: z.literal("my_data") }),
  ]);

export type CreateConstructionReportingBackupRequestModel = z.infer<
  typeof CreateConstructionReportingBackupRequestModel
>;

export const ListConstructionReportingBackupsRequestModel = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const ConstructionReportingBackupParamsModel = z.object({
  id: z.uuid(),
});

export const DownloadConstructionReportingBackupRequestModel = z.object({
  /** Unix seconds; signed. */
  expires: z.coerce.number().int().min(0),
  sig: z.string().min(1).max(200),
});

export const ListConstructionReportingBackupOptionsRequestModel = z
  .object({
    scope: z.enum(["project", "masters", "hrms"]),
    projectId: z.uuid().optional(),
  })
  .refine((query) => query.scope !== "project" || query.projectId != null, {
    message: "A Project backup needs projectId.",
    path: ["projectId"],
  });

// Responses

export const ConstructionReportingBackupModuleModel = z.object({
  key: z.string(),
  label: z.string(),
  group: z.string(),
  /** Its files would carry amounts for this viewer. */
  includesMoney: z.boolean(),
  /** "Media" adds its stored files. */
  hasMedia: z.boolean(),
});

export const ListConstructionReportingBackupOptionsResponseModel = z.object({
  modules: z.array(ConstructionReportingBackupModuleModel),
});

export type ListConstructionReportingBackupOptionsResponseModel = z.infer<
  typeof ListConstructionReportingBackupOptionsResponseModel
>;

export const ConstructionReportingBackupResponseModel = z.object({
  id: z.uuid(),
  scope: z.enum(["project", "masters", "company", "my_data"]),
  /** "Project backup", "Full Company backup", "My data". */
  title: z.string(),
  /** "3 modules · 01 Sep 2026 to 30 Sep 2026". */
  detail: z.string(),
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  modules: z.array(z.object({ key: z.string(), label: z.string() })),
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
  includeData: z.boolean(),
  includeMedia: z.boolean(),
  includesMoney: z.boolean(),
  status: z.enum(["queued", "running", "done", "failed", "expired"]),
  /** Parts written so far, for progress. */
  partsDone: z.number().int(),
  partsTotal: z.number().int(),
  error: z.string().nullable(),
  fileName: z.string().nullable(),
  bytes: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** When the link stops working and the file is deleted. */
  expiresAt: z.iso.datetime().nullable(),
  /** The signed download link (7 days, the requester only) while done. */
  downloadHref: z.string().nullable(),
  deleteHref: z.string(),
});

export type ConstructionReportingBackupResponseModel = z.infer<
  typeof ConstructionReportingBackupResponseModel
>;

export const ListConstructionReportingBackupsResponseModel = z.object({
  items: z.array(ConstructionReportingBackupResponseModel),
  nextCursor: z.string().nullable(),
});

export type ListConstructionReportingBackupsResponseModel = z.infer<
  typeof ListConstructionReportingBackupsResponseModel
>;
