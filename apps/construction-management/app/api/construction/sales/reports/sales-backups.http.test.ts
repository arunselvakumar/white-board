import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { unzipSync } from "fflate";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as downloadBackup } from "@/app/api/construction/reporting/backups/[id]/download/route";
import type { ConstructionReportingBackupResponseModel as Backup } from "@/app/api/construction/reporting/backups/backup-models";
import { POST as requestBackup } from "@/app/api/construction/reporting/backups/route";
import { BACKUPS_PATH } from "@/src/composition/backup-jobs";
import { missingBackupReaders } from "@/src/composition/backup-sources";
import { backupModule } from "@/src/reporting/domain/backup-modules";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { jsonRequest, ownerWithCompany } from "@/test/companies";
import { pngBytes } from "@/test/files";
import {
  salesBookingRow,
  salesFollowUpRow,
  salesInquiryFull,
  salesLists,
  salesProject,
  salesWing,
} from "@/test/sales";
import { TEST_ORIGIN } from "@/test/sessions";

const BASE = `${TEST_ORIGIN}${BACKUPS_PATH}`;

async function zipOf(cookie: string, backup: Backup) {
  const url = new URL(`${TEST_ORIGIN}${backup.downloadHref ?? ""}`);
  const id = url.pathname.split("/").at(-2) ?? "";
  const response = await downloadBackup(jsonRequest(url.toString(), cookie), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(StatusCodes.OK);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [
      path,
      /\.(csv|json)$/.test(path) ? new TextDecoder().decode(bytes) : bytes,
    ]),
  );
}

describe("Bookings backup module (CM-1008, CM-0022 §11)", () => {
  it("exports bookings with their history, unit sales details and the booking files", async () => {
    expect(missingBackupReaders()).toEqual([]);
    expect(backupModule("sales.bookings")?.entities).toEqual([
      "bookings",
      "booking_events",
      "unit_profiles",
    ]);
    const owner = await ownerWithCompany("Sales Builders");
    const ws = owner.workspaceId;
    const by = owner.userId;
    const projectId = await salesProject(ws, by, "Green Acres");
    const wing = await salesWing(ws, projectId, by, {
      name: "Tower A",
      floors: 1,
    });
    const live = await salesBookingRow(
      ws,
      projectId,
      wing.wingId,
      wing.units["101"] ?? "",
      by,
      { customerName: "Meena Raghavan", bookingDate: "2026-09-12" },
    );
    const gone = await salesBookingRow(
      ws,
      projectId,
      wing.wingId,
      wing.units["102"] ?? "",
      by,
      { customerName: "Deleted Buyer", bookingDate: "2026-09-13" },
    );
    await prisma.constructionSalesBooking.update({
      where: { id: gone },
      data: { deletedAt: new Date(), deletedBy: by },
    });
    await prisma.constructionSalesUnitProfile.create({
      data: {
        unitId: wing.units["101"] ?? "",
        workspaceId: ws,
        projectId,
        wingId: wing.wingId,
        unitType: "2BHK",
        carpetArea: "850",
        createdBy: by,
        updatedBy: by,
      },
    });
    const key = `companies/${ws}/sales-documents/${randomUUID()}.png`;
    await objectStorage().put(key, pngBytes(), "image/png");
    await prisma.constructionSalesDocumentFile.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        projectId,
        documentType: "booking",
        documentId: live,
        role: "photo",
        fileKey: key,
        fileName: "site-visit.png",
        contentType: "image/png",
        bytes: 64,
        createdBy: by,
      },
    });

    const response = await requestBackup(
      jsonRequest(BASE, owner.cookie, {
        scope: "project",
        projectId,
        modules: ["sales.bookings"],
        from: "2026-09-01",
        to: "2026-09-30",
        includeData: true,
        includeMedia: true,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const backup = (await response.json()) as Backup;
    expect(backup.error).toBeNull();
    expect(backup.status).toBe("done");
    const files = await zipOf(owner.cookie, backup);
    const manifest = JSON.parse(String(files["manifest.json"])) as {
      modules: {
        key: string;
        entities: { entity: string; rows: number }[];
        mediaFiles: number;
      }[];
    };
    expect(manifest.modules).toEqual([
      expect.objectContaining({
        key: "sales.bookings",
        entities: [
          { entity: "bookings", rows: 1 },
          { entity: "booking_events", rows: 1 },
          { entity: "unit_profiles", rows: 1 },
        ],
        mediaFiles: 1,
      }),
    ]);
    const bookings = String(files["bookings/bookings.csv"]);
    expect(bookings).toContain("Booking Date");
    expect(bookings).toContain("Meena Raghavan");
    expect(bookings).not.toContain("Deleted Buyer");
    expect(String(files["bookings/unit_profiles.csv"])).toContain("2BHK");
    expect(
      Object.keys(files).some(
        (path) =>
          path.startsWith("media/bookings/") && path.endsWith("site-visit.png"),
      ),
    ).toBe(true);
  });
});

describe("Inquiries backup module (CM-1008, CM-0022 §11)", () => {
  it("exports inquiries with their history, follow-ups, tasks and visiting cards", async () => {
    expect(backupModule("sales.inquiries")?.entities).toEqual([
      "inquiries",
      "inquiry_events",
      "follow_ups",
      "inquiry_tasks",
    ]);
    const owner = await ownerWithCompany("Sales Builders");
    const ws = owner.workspaceId;
    const by = owner.userId;
    const projectId = await salesProject(ws, by, "Green Meadows");
    const lists = await salesLists(projectId);
    const live = await salesInquiryFull(ws, projectId, by, {
      name: "Asha Rao",
      inquiryDate: "2026-09-12",
      funnelStageId: lists.stageId["New"],
      leadSourceId: lists.sourceId["Walk-in"],
    });
    const gone = await salesInquiryFull(ws, projectId, by, {
      name: "Deleted Lead",
      inquiryDate: "2026-09-13",
    });
    await prisma.constructionSalesInquiry.update({
      where: { id: gone },
      data: { deletedAt: new Date(), deletedBy: by },
    });
    await prisma.constructionSalesInquiryEvent.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        inquiryId: live,
        type: "created",
        actorUserId: by,
      },
    });
    await salesFollowUpRow(ws, projectId, live, by, { activity: "call" });
    await prisma.constructionSalesInquiryTask.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        inquiryId: live,
        title: "Send brochure",
        createdBy: by,
        updatedBy: by,
      },
    });
    const key = `companies/${ws}/sales-documents/${randomUUID()}.png`;
    await objectStorage().put(key, pngBytes(), "image/png");
    await prisma.constructionSalesDocumentFile.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        projectId,
        documentType: "inquiry",
        documentId: live,
        role: "visiting_card",
        fileKey: key,
        fileName: "card.png",
        contentType: "image/png",
        bytes: 64,
        createdBy: by,
      },
    });
    const response = await requestBackup(
      jsonRequest(BASE, owner.cookie, {
        scope: "project",
        projectId,
        modules: ["sales.inquiries"],
        from: "2026-09-01",
        to: "2026-09-30",
        includeData: true,
        includeMedia: true,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const backup = (await response.json()) as Backup;
    expect(backup.error).toBeNull();
    const files = await zipOf(owner.cookie, backup);
    const manifest = JSON.parse(String(files["manifest.json"])) as {
      modules: {
        key: string;
        entities: { entity: string; rows: number }[];
        mediaFiles: number;
      }[];
    };
    expect(manifest.modules).toEqual([
      expect.objectContaining({
        key: "sales.inquiries",
        entities: [
          { entity: "inquiries", rows: 1 },
          { entity: "inquiry_events", rows: 1 },
          { entity: "follow_ups", rows: 1 },
          { entity: "inquiry_tasks", rows: 1 },
        ],
        mediaFiles: 1,
      }),
    ]);
    const inquiries = String(files["inquiries/inquiries.csv"]);
    expect(inquiries).toContain("Asha Rao");
    expect(inquiries).toContain("Walk-in");
    expect(inquiries).not.toContain("Deleted Lead");
    expect(String(files["inquiries/inquiry_tasks.csv"])).toContain(
      "Send brochure",
    );
  });
});
