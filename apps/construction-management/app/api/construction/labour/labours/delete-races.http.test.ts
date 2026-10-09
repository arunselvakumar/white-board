import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as recordPayment } from "@/app/api/construction/labour/payments/route";
import { POST as deleteVendor } from "@/app/api/construction/labour/vendors/[id]/delete/route";
import { POST as createVendor } from "@/app/api/construction/labour/vendors/route";
import { lockLiveParties } from "@/src/labour/infrastructure/party-locks";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteLabour } from "./[id]/delete/route";
import { POST as createLabour } from "./route";

const API = `${TEST_ORIGIN}/api/construction/labour`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function addLabour(company: Company, projectId: string) {
  const response = await createLabour(
    jsonRequest(`${API}/labours`, company.cookie, {
      name: `Dhuresh ${newId().slice(-6)}`,
      joiningDate: "2026-08-01",
      wageType: "daily",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [0],
      currentProjectId: projectId,
      openingBalance: 5_000,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

function pay(
  company: Company,
  partyType: "labour" | "vendor",
  partyId: string,
  projectId: string,
) {
  return recordPayment(
    jsonRequest(`${API}/payments`, company.cookie, {
      partyType,
      partyId,
      projectId,
      paymentDate: "2026-09-12",
      kind: "advance",
      mode: "cash",
      amount: 10_000,
    }),
  );
}

function removeLabour(company: Company, id: string) {
  return deleteLabour(
    jsonRequest(`${API}/labours/${id}/delete`, company.cookie, {}),
    params(id),
  );
}

/** Resolves to whether `promise` is still pending after `ms`. */
async function stillPending(promise: Promise<unknown>, ms: number) {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !settled;
}

async function livePayments(partyId: string) {
  return prisma.constructionLabourWagePayment.count({
    where: { partyId, deletedAt: null },
  });
}

describe("deleting a Labour or Vendor against concurrent payments", () => {
  it("refuses to delete a Labour with a payment", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const labourId = await addLabour(company, tower);
    expect((await pay(company, "labour", labourId, tower)).status).toBe(
      StatusCodes.CREATED,
    );
    const refused = await removeLabour(company, labourId);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("LABOUR_HAS_RECORDS");
  });

  it("makes a delete wait for a payment being written, then refuse", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const labourId = await addLabour(company, tower);
    let deleting: Promise<Response> | undefined;
    // What the payment path does: lock the labourer FOR SHARE, insert.
    await prisma.$transaction(async (tx) => {
      await lockLiveParties(
        tx,
        company.workspaceId,
        "labour",
        [labourId],
        "share",
      );
      deleting = removeLabour(company, labourId);
      expect(await stillPending(deleting, 300)).toBe(true);
      await tx.constructionLabourWagePayment.create({
        data: {
          id: newId(),
          workspaceId: company.workspaceId,
          partyType: "labour",
          partyId: labourId,
          projectId: tower,
          paymentDate: calendarDateToDb("2026-09-12"),
          kind: "advance",
          mode: "cash",
          amount: 10_000,
          createdBy: company.userId,
          updatedBy: company.userId,
        },
      });
    });
    if (deleting == null) throw new Error("The delete never started.");
    const refused = await deleting;
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("LABOUR_HAS_RECORDS");
  });

  it("makes a payment wait for a delete in progress, then refuse with 404", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const labourId = await addLabour(company, tower);
    let paying: Promise<Response> | undefined;
    // What the delete path does: lock the labourer FOR UPDATE, tombstone.
    await prisma.$transaction(async (tx) => {
      await lockLiveParties(
        tx,
        company.workspaceId,
        "labour",
        [labourId],
        "update",
      );
      paying = pay(company, "labour", labourId, tower);
      expect(await stillPending(paying, 300)).toBe(true);
      await tx.constructionLabourLabour.update({
        where: { id: labourId },
        data: { deletedAt: new Date(), deletedBy: company.userId },
      });
    });
    if (paying == null) throw new Error("The payment never started.");
    const refused = await paying;
    expect(refused.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(refused)).toBe("LABOUR_NOT_FOUND");
    expect(await livePayments(labourId)).toBe(0);
  });

  it("never lets a payment and a delete both succeed (10 races each)", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    for (let round = 0; round < 10; round += 1) {
      const labourId = await addLabour(company, tower);
      const [paid, deleted] = await Promise.all([
        pay(company, "labour", labourId, tower),
        removeLabour(company, labourId),
      ]);
      const outcome = [paid.status, deleted.status];
      expect([
        [StatusCodes.CREATED, StatusCodes.CONFLICT],
        [StatusCodes.NOT_FOUND, StatusCodes.NO_CONTENT],
      ]).toContainEqual(outcome);
      const tombstoned = await prisma.constructionLabourLabour.count({
        where: { id: labourId, deletedAt: { not: null } },
      });
      expect(tombstoned === 1 && (await livePayments(labourId)) > 0).toBe(
        false,
      );
    }

    for (let round = 0; round < 10; round += 1) {
      const vendor = await json<{ id: string }>(
        await createVendor(
          jsonRequest(`${API}/vendors`, company.cookie, {
            name: `Gang ${newId().slice(-6)}`,
            joiningDate: "2026-08-01",
            projectIds: [tower],
            shifts: [],
          }),
        ),
      );
      const [paid, deleted] = await Promise.all([
        pay(company, "vendor", vendor.id, tower),
        deleteVendor(
          jsonRequest(`${API}/vendors/${vendor.id}/delete`, company.cookie, {}),
          params(vendor.id),
        ),
      ]);
      expect([
        [StatusCodes.CREATED, StatusCodes.CONFLICT],
        [StatusCodes.NOT_FOUND, StatusCodes.NO_CONTENT],
      ]).toContainEqual([paid.status, deleted.status]);
    }
  });
});
