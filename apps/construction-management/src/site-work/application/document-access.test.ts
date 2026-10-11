import { describe, expect, it } from "vitest";

import {
  PermissionSet,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

import {
  canOnSiteWorkDocument,
  mayRemoveSiteWorkFile,
  siteWorkDocumentRights,
} from "./document-access";

function member(grants: PermissionGrants, projectIds: string[]): MemberAccess {
  return {
    workspaceId: "company-1",
    userId: "user-2",
    role: "member",
    permissions: PermissionSet.fromGrants(grants),
    projectIds: new Set(projectIds),
  };
}

const worksheet = { type: "worksheet" as const, projectId: "p1" };

describe("site-work document access (CM-0016 §8)", () => {
  it("checks the document's own menu on its Project", () => {
    const reader = member({ "site_work.daily_worksheet": ["read"] }, ["p1"]);
    expect(canOnSiteWorkDocument(reader, worksheet, "read")).toBe(true);
    expect(
      canOnSiteWorkDocument(
        reader,
        { type: "worksheet", projectId: "p2" },
        "read",
      ),
    ).toBe(false);
    expect(
      canOnSiteWorkDocument(
        reader,
        { type: "hindrance", projectId: "p1" },
        "read",
      ),
    ).toBe(false);
    const diary = member({ "site_work.site_diary": ["read"] }, ["p1"]);
    expect(
      canOnSiteWorkDocument(
        diary,
        { type: "site_diary", projectId: "p1" },
        "read",
      ),
    ).toBe(true);
  });

  it("comments with Read, uploads with Create or Update, removes any with Update", () => {
    const reader = siteWorkDocumentRights(
      member({ "site_work.daily_worksheet": ["read"] }, ["p1"]),
      worksheet,
    );
    expect(reader).toEqual({
      read: true,
      comment: true,
      upload: false,
      removeAny: false,
      removeOwn: false,
    });
    const creator = siteWorkDocumentRights(
      member({ "site_work.daily_worksheet": ["read", "create"] }, ["p1"]),
      worksheet,
    );
    expect(creator.upload).toBe(true);
    expect(
      mayRemoveSiteWorkFile(creator, { createdBy: "user-2" }, "user-2"),
    ).toBe(true);
    expect(
      mayRemoveSiteWorkFile(creator, { createdBy: "user-9" }, "user-2"),
    ).toBe(false);
    const editor = siteWorkDocumentRights(
      member({ "site_work.daily_worksheet": ["read", "update"] }, ["p1"]),
      worksheet,
    );
    expect(editor.upload).toBe(true);
    expect(
      mayRemoveSiteWorkFile(editor, { createdBy: "user-9" }, "user-2"),
    ).toBe(true);
  });

  it("gives nothing without Read, or off the Project", () => {
    expect(
      siteWorkDocumentRights(
        member({ "site_work.daily_worksheet": ["create", "update"] }, ["p1"]),
        worksheet,
      ).upload,
    ).toBe(false);
    expect(
      siteWorkDocumentRights(
        member({ "site_work.daily_worksheet": ["read", "update"] }, ["p2"]),
        worksheet,
      ).read,
    ).toBe(false);
  });
});
