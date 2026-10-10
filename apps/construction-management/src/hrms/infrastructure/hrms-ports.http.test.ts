import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { addMember, addProject, newCompany } from "@/test/companies";

import { DEFAULT_HRMS_SETTINGS } from "../domain/hrms-settings";
import { createHrmsPorts } from "./create-hrms-ports";

const ports = createHrmsPorts();

describe("hrms ports over Postgres (M3 foundation)", () => {
  it("lists Team Members as employees with Designation and Projects", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    const member = await addMember(company.workspaceId, company.ownerId, {
      "hrms.attendance": ["create", "read"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: member.memberId, projectId },
    });

    const employees = await ports.employees.list(company.workspaceId);
    expect(employees.map((employee) => employee.name).sort()).toEqual([
      "Arun Selva Kumar",
      "Prabhu Saravanan",
    ]);
    const found = await ports.employees.find(company.workspaceId, [
      member.memberId,
      randomUUID(),
    ]);
    expect(found.size).toBe(1);
    expect(found.get(member.memberId)).toMatchObject({
      userId: member.userId,
      memberType: "normal",
      designationName: "Site Engineer",
      projectIds: [projectId],
      active: true,
      isOwner: false,
    });
    expect(
      (await ports.employees.findByUserId(company.workspaceId, company.ownerId))
        ?.isOwner,
    ).toBe(true);

    // Another Company sees none of them.
    const other = await newCompany();
    expect(
      (await ports.employees.find(other.workspaceId, [member.memberId])).size,
    ).toBe(0);
    expect(
      await ports.employees.findByUserId(other.workspaceId, member.userId),
    ).toBeNull();
    expect(await ports.projects.find(other.workspaceId, [projectId])).toEqual(
      new Map(),
    );
    expect(
      (await ports.projects.list(company.workspaceId)).map((item) => item.id),
    ).toEqual([projectId]);
  });

  it("reads the Settings, defaults first", async () => {
    const company = await newCompany();
    expect(await ports.settings.settingsFor(company.workspaceId)).toEqual(
      DEFAULT_HRMS_SETTINGS,
    );
  });

  it("closes a member's month on their own lock or the Company's", async () => {
    const company = await newCompany();
    const member = await addMember(company.workspaceId, company.ownerId, {});
    const other = await addMember(company.workspaceId, company.ownerId, {});
    await prisma.constructionHrmsMonthLock.create({
      data: {
        id: randomUUID(),
        workspaceId: company.workspaceId,
        memberId: member.memberId,
        month: "2026-09",
        lockedAt: new Date(),
        lockedBy: company.ownerId,
      },
    });
    const { monthLock } = ports;
    expect(
      await monthLock.isLocked(
        company.workspaceId,
        member.memberId,
        "2026-09-30",
      ),
    ).toBe(true);
    expect(
      await monthLock.isLocked(
        company.workspaceId,
        member.memberId,
        "2026-10-01",
      ),
    ).toBe(false);
    expect(
      await monthLock.isLocked(
        company.workspaceId,
        other.memberId,
        "2026-09-15",
      ),
    ).toBe(false);
    await expect(
      monthLock.assertOpen(company.workspaceId, member.memberId, "2026-09-01"),
    ).rejects.toThrow(DomainError);

    await prisma.constructionHrmsMonthLock.create({
      data: {
        id: randomUUID(),
        workspaceId: company.workspaceId,
        memberId: null,
        month: "2026-08",
        lockedAt: new Date(),
        lockedBy: company.ownerId,
      },
    });
    expect(
      await monthLock.isLocked(
        company.workspaceId,
        other.memberId,
        "2026-08-31",
      ),
    ).toBe(true);
  });

  it("answers statutory figures from the seeded tables (ADR CM-0008)", async () => {
    const { statutoryRates } = ports;
    expect(await statutoryRates.pfFor("2026-10")).toMatchObject({
      effectiveFrom: "2014-09-01",
      wageCeiling: 1_500_000,
      employeePercent: "12.00",
      employerPercent: "12.00",
      epsPercent: "8.33",
    });
    expect(await statutoryRates.pfFor("2014-08")).toBeNull();
    expect(await statutoryRates.esiFor("2026-10")).toMatchObject({
      wageCeiling: 2_100_000,
      pwdWageCeiling: 2_500_000,
      employeePercent: "0.75",
      employerPercent: "3.25",
    });
    // Karnataka: Rs 200 a month from Rs 25,000, Rs 300 in February.
    expect(
      (await statutoryRates.ptFor("29", "2026-10", 2_500_000)).amount,
    ).toBe(20_000);
    expect(
      (await statutoryRates.ptFor("29", "2027-02", 2_500_000)).amount,
    ).toBe(30_000);
    expect(
      (await statutoryRates.ptFor("29", "2026-10", 2_499_999)).amount,
    ).toBe(0);
    // Maharashtra splits men and women.
    expect(
      (await statutoryRates.ptFor("27", "2026-10", 2_000_000, "female")).amount,
    ).toBe(0);
    expect(
      (await statutoryRates.ptFor("27", "2026-10", 2_000_000, "male")).amount,
    ).toBe(20_000);
    // Tamil Nadu has no rows yet: no PT.
    expect(
      (await statutoryRates.ptFor("33", "2026-10", 9_000_000)).amount,
    ).toBe(0);
  });
});
