import type { DocumentNaming } from "@/src/shared-kernel/approval";
import type { BackdatedModuleKey } from "@/src/shared-kernel/backdated-policy";
import type { MenuKey } from "@/src/shared-kernel/access/menus";
import type { SequenceModuleKey } from "@/src/shared-kernel/sequence";

/**
 * The four site-work documents and what each one is wired to: its
 * numbering module (CM-114), back-dated module (CM-113), Permission Matrix
 * menu (CM-107) and the naming its errors use (ADR CM-0016). Every site-work
 * menu is Project-scoped.
 */
export const SITE_WORK_DOCUMENT_TYPES = [
  "worksheet",
  "equipment_usage",
  "site_diary",
  "hindrance",
] as const;
export type SiteWorkDocumentType = (typeof SITE_WORK_DOCUMENT_TYPES)[number];

export type SiteWorkDocument = {
  type: SiteWorkDocumentType;
  naming: DocumentNaming;
  /** Null for the Site Diary, which is known by its date. */
  sequence: SequenceModuleKey | null;
  backdated: BackdatedModuleKey;
  menu: MenuKey;
};

export const SITE_WORK_DOCUMENTS: Record<
  SiteWorkDocumentType,
  SiteWorkDocument
> = {
  worksheet: {
    type: "worksheet",
    naming: { code: "WORKSHEET", label: "Daily Worksheet" },
    sequence: "daily_worksheet",
    backdated: "daily_worksheet",
    menu: "site_work.daily_worksheet",
  },
  equipment_usage: {
    type: "equipment_usage",
    naming: { code: "EQUIPMENT_SHEET", label: "Equipment Usage sheet" },
    sequence: "equipment_usage",
    backdated: "equipment_usage",
    menu: "site_work.equipment_usage",
  },
  site_diary: {
    type: "site_diary",
    naming: { code: "SITE_DIARY", label: "Site Diary" },
    sequence: null,
    backdated: "site_diary",
    menu: "site_work.site_diary",
  },
  hindrance: {
    type: "hindrance",
    naming: { code: "HINDRANCE", label: "Hindrance" },
    sequence: "hindrance",
    backdated: "hindrance",
    menu: "site_work.hindrances",
  },
};

export function isSiteWorkDocumentType(
  value: string,
): value is SiteWorkDocumentType {
  return (SITE_WORK_DOCUMENT_TYPES as readonly string[]).includes(value);
}
