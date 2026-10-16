import { describe, expect, it } from "vitest";

import { CompanyDeletion } from "./company-deletion";

const NOW = new Date("2026-10-16T10:00:00Z");

function scheduled(typedName = "Anugraha Engineers") {
  return CompanyDeletion.schedule({
    id: "deletion-1",
    workspaceId: "company-1",
    companyName: "Anugraha Engineers",
    typedName,
    ownerUserId: "owner-1",
    now: NOW,
  });
}

describe("CompanyDeletion", () => {
  it("falls due 30 days after it is asked for", () => {
    const deletion = scheduled();
    expect(deletion.scheduledFor.toISOString()).toBe(
      "2026-11-15T10:00:00.000Z",
    );
    expect(deletion.isPending).toBe(true);
    expect(deletion.isDue(new Date("2026-11-15T09:59:59Z"))).toBe(false);
    expect(deletion.isDue(new Date("2026-11-15T10:00:00Z"))).toBe(true);
  });

  it("needs the Company's name, forgiving case and spaces", () => {
    expect(scheduled("  anugraha   ENGINEERS ").companyName).toBe(
      "Anugraha Engineers",
    );
    expect(() => scheduled("Anugraha")).toThrow(
      expect.objectContaining({ code: "COMPANY_NAME_MISMATCH" }) as Error,
    );
  });

  it("can be cancelled once while pending, and is never due after", () => {
    const deletion = scheduled();
    deletion.cancel("owner-1", NOW);
    expect(deletion).toMatchObject({
      cancelledBy: "owner-1",
      isPending: false,
    });
    expect(deletion.isDue(new Date("2027-01-01T00:00:00Z"))).toBe(false);
    expect(() => {
      deletion.cancel("owner-1", NOW);
    }).toThrow(
      expect.objectContaining({ code: "NO_COMPANY_DELETION" }) as Error,
    );
  });

  it("keeps the summary when completed", () => {
    const deletion = scheduled();
    deletion.complete({ "construction_projects.projects": 2 }, NOW);
    expect(deletion.isPending).toBe(false);
    expect(deletion.summary).toEqual({ "construction_projects.projects": 2 });
  });
});
