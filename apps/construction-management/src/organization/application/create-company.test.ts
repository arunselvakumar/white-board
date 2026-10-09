import { describe, expect, it, vi } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";
import type { DomainEvent } from "@/src/shared-kernel/events";

import { Designation } from "../domain/designation";
import type { NewCompany } from "../domain/new-company";
import {
  CreateCompanyHandler,
  type CreateCompanyCommand,
} from "./create-company";

const NOW = new Date("2026-10-08T06:30:00Z");

const command: CreateCompanyCommand = {
  name: "  Patil Builders  ",
  country: "IN",
  gstin: "27AAPFU0939F1ZV",
  pan: "AAPFU0939F",
  userId: "user-1",
  userName: "Ramesh Patil",
  userMobile: "+919876543210",
  userEmail: null,
};

function setup(storeFails = false) {
  const created: NewCompany[] = [];
  const events: DomainEvent[] = [];
  const directory = {
    createWorkspace: vi.fn(() => Promise.resolve({ workspaceId: "company-1" })),
    deleteWorkspace: vi.fn(() => Promise.resolve()),
  };
  const handler = new CreateCompanyHandler(
    directory,
    {
      create: (company) => {
        if (storeFails) return Promise.reject(new Error("db down"));
        created.push(company);
        return Promise.resolve();
      },
    },
    ({ workspaceId, by, now }) => [
      Designation.create({
        id: "d1",
        workspaceId,
        name: "Owner",
        template: null,
        isSeed: true,
        by,
        now,
      }),
    ],
    {
      dispatch: (raised) => {
        events.push(...raised);
        return Promise.resolve();
      },
    },
    () => NOW,
  );
  return { handler, directory, created, events };
}

describe("CreateCompanyHandler", () => {
  it("creates the Workspace with the caller as its one Owner", async () => {
    const { handler, directory, created, events } = setup();
    const result = await handler.execute(command);

    expect(directory.createWorkspace).toHaveBeenCalledWith({
      name: "Patil Builders",
      ownerUserId: "user-1",
    });
    expect(result).toEqual({
      workspaceId: "company-1",
      name: "Patil Builders",
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.owner).toEqual({
      userId: "user-1",
      name: "Ramesh Patil",
      mobile: "+919876543210",
      email: null,
    });
    expect(created[0]?.designations.map((item) => item.name)).toEqual([
      "Owner",
    ]);
    expect(created[0]?.ownerMember).toMatchObject({
      isOwner: true,
      status: "active",
      userId: "user-1",
    });
    expect(created[0]?.ownerMember.details.designationId).toBe("d1");
    expect(created[0]?.details.value).toMatchObject({
      currency: "INR",
      timezone: "Asia/Kolkata",
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "CompanyCreated",
        workspaceId: "company-1",
        ownerUserId: "user-1",
      }),
    ]);
  });

  it("requires a name", async () => {
    const { handler, directory } = setup();
    await expect(handler.execute({ ...command, name: "   " })).rejects.toThrow(
      DomainError,
    );
    expect(directory.createWorkspace).not.toHaveBeenCalled();
  });

  it("rejects a GSTIN that fails its check character or does not contain the PAN", async () => {
    const { handler } = setup();
    await expect(
      handler.execute({ ...command, gstin: "27AAPFU0939F1ZW" }),
    ).rejects.toMatchObject({ code: "GSTIN_INVALID" });
    await expect(
      handler.execute({ ...command, pan: "ABCPE1234F" }),
    ).rejects.toMatchObject({ code: "GSTIN_PAN_MISMATCH" });
  });

  it("drops GSTIN and PAN for a Company outside India", async () => {
    const { handler, created } = setup();
    await handler.execute({ ...command, country: "AE" });
    expect(created[0]?.details.value).toMatchObject({
      gstin: null,
      pan: null,
      currency: "AED",
    });
  });

  it("removes the Workspace again when the rest fails", async () => {
    const { handler, directory, events } = setup(true);
    await expect(handler.execute(command)).rejects.toThrow("db down");
    expect(directory.deleteWorkspace).toHaveBeenCalledWith("company-1");
    expect(events).toEqual([]);
  });
});
