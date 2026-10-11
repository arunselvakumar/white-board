import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

/**
 * HTTP-test helpers for site work (M6). Each area prefixes its own helpers
 * (`shared…` for the document thread, `worksheet…`, `equipment…` …) so
 * parallel tickets never clash here.
 */

// ---------------------------------------------------------------------------
// Shared: minimal live document rows for the document thread (CM-0016 §8).
// Only the columns each table requires; the documents' own routes are
// other tickets'.
// ---------------------------------------------------------------------------

const SHARED_DAY = new Date("2026-10-08T00:00:00.000Z");

let sharedSequence = 0;

function sharedNumber(prefix: string): string {
  sharedSequence += 1;
  return `${prefix}/${randomUUID().slice(0, 6)}/${String(sharedSequence)}`;
}

const sharedAudit = (by: string) => ({ createdBy: by, updatedBy: by });

export type SharedDocumentRow = { id: string; label: string };

/** A live Daily Worksheet on the Project. */
export async function sharedAddWorksheetRow(
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  const id = randomUUID();
  const number = sharedNumber("WS");
  await prisma.constructionSiteWorkWorksheet.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      sheetDate: SHARED_DAY,
      shift: "shift_1",
      contractorId: randomUUID(),
      departmentId: randomUUID(),
      ...sharedAudit(by),
    },
  });
  return { id, label: number };
}

/** A live Equipment Usage sheet on the Project, with its own equipment. */
export async function sharedAddEquipmentUsageRow(
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  const equipmentId = randomUUID();
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id: equipmentId,
      workspaceId,
      name: "JCB 3DX",
      equipmentNumber: `TN-${randomUUID().slice(0, 8)}`,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      currentProjectId: projectId,
      ...sharedAudit(by),
    },
  });
  const id = randomUUID();
  const number = sharedNumber("EU");
  await prisma.constructionSiteWorkEquipmentUsageSheet.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      sheetDate: SHARED_DAY,
      shift: "shift_1",
      equipmentId,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      ...sharedAudit(by),
    },
  });
  return { id, label: number };
}

/** A live Site Diary on the Project for `date` (one per Project per date). */
export async function sharedAddSiteDiaryRow(
  workspaceId: string,
  by: string,
  projectId: string,
  date = "2026-10-08",
): Promise<SharedDocumentRow> {
  const id = randomUUID();
  await prisma.constructionSiteWorkSiteDiary.create({
    data: {
      id,
      workspaceId,
      projectId,
      diaryDate: new Date(`${date}T00:00:00.000Z`),
      ...sharedAudit(by),
    },
  });
  return { id, label: date };
}

/** A live Hindrance on the Project. */
export async function sharedAddHindranceRow(
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  const id = randomUUID();
  const number = sharedNumber("HR");
  await prisma.constructionSiteWorkHindrance.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      startDate: SHARED_DAY,
      cause: "weather",
      affectedActivity: "Slab casting, 3rd floor",
      responsibleParty: "force_majeure",
      ...sharedAudit(by),
    },
  });
  return { id, label: number };
}

/** A live document of `type` on the Project. */
export function sharedAddDocumentRow(
  type: SiteWorkDocumentType,
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  switch (type) {
    case "worksheet":
      return sharedAddWorksheetRow(workspaceId, by, projectId);
    case "equipment_usage":
      return sharedAddEquipmentUsageRow(workspaceId, by, projectId);
    case "site_diary":
      return sharedAddSiteDiaryRow(workspaceId, by, projectId);
    case "hindrance":
      return sharedAddHindranceRow(workspaceId, by, projectId);
  }
}

/** Tombstones a document as its own delete would. */
export async function sharedDeleteDocumentRow(
  type: SiteWorkDocumentType,
  id: string,
): Promise<void> {
  const data = { deletedAt: new Date(), deletedBy: "test" };
  const where = { id };
  switch (type) {
    case "worksheet":
      await prisma.constructionSiteWorkWorksheet.update({ where, data });
      return;
    case "equipment_usage":
      await prisma.constructionSiteWorkEquipmentUsageSheet.update({
        where,
        data,
      });
      return;
    case "site_diary":
      await prisma.constructionSiteWorkSiteDiary.update({ where, data });
      return;
    case "hindrance":
      await prisma.constructionSiteWorkHindrance.update({ where, data });
      return;
  }
}

/** Puts a Team Member on Projects (`memberWith` assigns none). */
export async function sharedAssign(
  memberId: string,
  ...projectIds: string[]
): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}
