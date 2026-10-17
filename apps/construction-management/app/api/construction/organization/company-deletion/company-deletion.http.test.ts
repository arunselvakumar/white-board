import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import {
  GET as listDesignations,
  POST as addDesignation,
} from "@/app/api/construction/organization/designations/route";
import { POST as revealMine } from "@/app/api/construction/organization/me/profile/reveal-identifiers/route";
import { POST as transfer } from "@/app/api/construction/organization/ownership/transfer/route";
import { codeFor, requestCode } from "@/test/accounts";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as cancel } from "./cancel/route";
import { GET as status, POST as schedule } from "./route";

const ORG = `${TEST_ORIGIN}/api/construction/organization`;
const BASE = `${ORG}/company-deletion`;
const DAY_MS = 24 * 60 * 60 * 1000;

function scheduleDeletion(cookie: string, companyName: string, code: string) {
  return schedule(jsonRequest(BASE, cookie, { companyName, code }));
}

function newDesignation(cookie: string) {
  return addDesignation(
    jsonRequest(`${ORG}/designations`, cookie, {
      name: `Surveyor ${crypto.randomUUID().slice(0, 6)}`,
    }),
  );
}

async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

describe("Delete Company (CM-907)", () => {
  it("is the Owner's alone", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {
      "organization.settings": ["read", "update"],
    });
    const refused = await scheduleDeletion(
      member.cookie,
      "Anugraha Engineers",
      "123456",
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await cancel(jsonRequest(`${BASE}/cancel`, member.cookie, {}))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    // Anyone in the Company may read whether it is being deleted.
    const read = await status(jsonRequest(BASE, member.cookie));
    expect(read.status).toBe(StatusCodes.OK);
    expect(await read.json()).toEqual({ deletion: null });
  });

  it("needs the Company's name and the code", async () => {
    const owner = await ownerWithCompany("Anugraha Engineers");
    const code = await codeFor(owner, "delete_company");
    const typo = await scheduleDeletion(owner.cookie, "Anugraha", code);
    expect(typo.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(typo)).toBe("COMPANY_NAME_MISMATCH");
    const wrong = await scheduleDeletion(
      owner.cookie,
      "Anugraha Engineers",
      code === "111111" ? "222222" : "111111",
    );
    expect(await codeOf(wrong)).toBe("ACTION_CODE_INVALID");
    await expect(
      prisma.constructionOrganizationCompanyDeletion.count({
        where: { deletedWorkspaceId: owner.workspaceId },
      }),
    ).resolves.toBe(0);
  });

  it("schedules 30 days ahead, makes the Company read-only, and the Owner can cancel", async () => {
    const owner = await ownerWithCompany("Anugraha Engineers");
    const member = await memberWith(owner, {
      "organization.designations": ["read", "create"],
    });
    const code = await codeFor(owner, "delete_company");
    // Case and spacing are forgiven.
    const response = await scheduleDeletion(
      owner.cookie,
      "  anugraha   engineers ",
      code,
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const body = (await response.json()) as {
      requestedAt: string;
      scheduledFor: string;
    };
    expect(Date.parse(body.scheduledFor) - Date.parse(body.requestedAt)).toBe(
      30 * DAY_MS,
    );
    const read = await status(jsonRequest(BASE, member.cookie));
    expect(await read.json()).toEqual({ deletion: body });
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: owner.workspaceId,
          action: "company.deletion_scheduled",
        },
      }),
    ).resolves.toBe(1);

    // Every write is refused, for the Owner and members alike.
    for (const cookie of [owner.cookie, member.cookie]) {
      const write = await newDesignation(cookie);
      expect(write.status).toBe(StatusCodes.CONFLICT);
      expect(await write.json()).toMatchObject({
        code: "COMPANY_DELETION_SCHEDULED",
        details: { scheduledFor: body.scheduledFor },
      });
    }
    const transferred = await transfer(
      jsonRequest(`${ORG}/ownership/transfer`, owner.cookie, {
        memberId: member.memberId,
        code: "123456",
      }),
    );
    expect(await codeOf(transferred)).toBe("COMPANY_DELETION_SCHEDULED");
    // Reads, codes and reveals stay open.
    expect(
      (
        await listDesignations(
          jsonRequest(`${ORG}/designations`, member.cookie),
        )
      ).status,
    ).toBe(StatusCodes.OK);
    expect((await requestCode(owner.cookie, "company_backup")).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const reveal = await revealMine(
      jsonRequest(`${ORG}/me/profile/reveal-identifiers`, owner.cookie, {}),
    );
    expect(await codeOf(reveal)).toBe("REVEAL_CODE_REQUIRED");
    // Asking again while one is pending is refused.
    const twice = await scheduleDeletion(
      owner.cookie,
      "Anugraha Engineers",
      await codeFor(owner, "delete_company"),
    );
    expect(await codeOf(twice)).toBe("COMPANY_DELETION_SCHEDULED");

    const cancelled = await cancel(
      jsonRequest(`${BASE}/cancel`, owner.cookie, {}),
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);
    const row =
      await prisma.constructionOrganizationCompanyDeletion.findFirstOrThrow({
        where: { deletedWorkspaceId: owner.workspaceId },
      });
    expect(row.cancelledBy).toBe(owner.userId);
    expect(row.cancelledAt).not.toBeNull();
    expect(
      await (await status(jsonRequest(BASE, owner.cookie))).json(),
    ).toEqual({
      deletion: null,
    });
    expect((await newDesignation(member.cookie)).status).toBe(
      StatusCodes.CREATED,
    );
    const again = await cancel(jsonRequest(`${BASE}/cancel`, owner.cookie, {}));
    expect(await codeOf(again)).toBe("NO_COMPANY_DELETION");
  });

  it("leaves other Companies writable", async () => {
    const doomed = await ownerWithCompany("Anugraha Engineers");
    const other = await ownerWithCompany("Velan Builders");
    const code = await codeFor(doomed, "delete_company");
    expect(
      (await scheduleDeletion(doomed.cookie, "Anugraha Engineers", code))
        .status,
    ).toBe(StatusCodes.CREATED);
    expect((await newDesignation(other.cookie)).status).toBe(
      StatusCodes.CREATED,
    );
  });
});
