import { describe, expect, it } from "vitest";

import {
  PermissionSet,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

import {
  canReadTrackingDocument,
  mayRemoveTrackingFile,
  trackingDocumentRights,
  trackingFilesFinal,
} from "./document-access";

function member(grants: PermissionGrants, projectIds = ["p1"]): MemberAccess {
  return {
    workspaceId: "company-1",
    userId: "user-2",
    role: "member",
    permissions: PermissionSet.fromGrants(grants),
    projectIds: new Set(projectIds),
  };
}

const issue = {
  type: "issue" as const,
  projectId: "p1",
  createdBy: "user-9",
  assigneeMemberIds: ["member-7"],
  inspection: null,
};
const task = { ...issue, type: "task" as const };
const inspection = {
  type: "inspection" as const,
  projectId: "p1",
  createdBy: "user-9",
  assigneeMemberIds: null,
  inspection: { status: "pending" as const, inspectorMemberId: "member-5" },
};

describe("tracking document files access (CM-0019 §11)", () => {
  it("needs Read on the document's menu on its Project", () => {
    const reader = member({ "tracking.inspection_requests": ["read"] });
    expect(canReadTrackingDocument(reader, inspection, null)).toBe(true);
    expect(
      canReadTrackingDocument(reader, { ...inspection, projectId: "p2" }, null),
    ).toBe(false);
    expect(canReadTrackingDocument(reader, issue, null)).toBe(false);
  });

  it("without View all, reads only own or assigned tasks and issues", () => {
    const reader = member({ "tracking.issues": ["read"] });
    expect(canReadTrackingDocument(reader, issue, null)).toBe(false);
    expect(canReadTrackingDocument(reader, issue, "member-7")).toBe(true);
    expect(
      canReadTrackingDocument(reader, { ...issue, createdBy: "user-2" }, null),
    ).toBe(true);
    const all = member({ "tracking.issues": ["read", "view_all"] });
    expect(canReadTrackingDocument(all, issue, null)).toBe(true);
  });

  it("uploads task photos with Update, issue and inspection files with Create or Update", () => {
    const taskCreator = member({
      "tracking.tasks": ["create", "read", "view_all"],
    });
    expect(trackingDocumentRights(taskCreator, task, null).upload).toBe(false);
    const taskUpdater = member({
      "tracking.tasks": ["read", "update", "view_all"],
    });
    expect(trackingDocumentRights(taskUpdater, task, null)).toEqual({
      read: true,
      upload: true,
      removeAny: true,
      removeOwn: true,
    });
    const issueCreator = member({
      "tracking.issues": ["create", "read", "view_all"],
    });
    expect(trackingDocumentRights(issueCreator, issue, null)).toEqual({
      read: true,
      upload: true,
      removeAny: false,
      removeOwn: true,
    });
    const inspector = member({
      "tracking.inspection_requests": ["read", "update"],
    });
    expect(trackingDocumentRights(inspector, inspection, null).upload).toBe(
      true,
    );
  });

  it("lets an inspection's inspector upload with Read only, while pending (CM-804)", () => {
    const reader = member({ "tracking.inspection_requests": ["read"] });
    expect(trackingDocumentRights(reader, inspection, "member-5")).toEqual({
      read: true,
      upload: true,
      removeAny: false,
      removeOwn: true,
    });
    expect(trackingDocumentRights(reader, inspection, "member-6").upload).toBe(
      false,
    );
    expect(
      trackingDocumentRights(
        reader,
        {
          ...inspection,
          inspection: { status: "pending", inspectorMemberId: null },
        },
        null,
      ).upload,
    ).toBe(false);
  });

  it("freezes a decided inspection's files for everyone (CM-804)", () => {
    const updater = member({
      "tracking.inspection_requests": ["create", "read", "update"],
    });
    for (const status of ["approved", "rejected"] as const) {
      const decided = {
        ...inspection,
        inspection: { status, inspectorMemberId: "member-5" },
      };
      expect(trackingDocumentRights(updater, decided, "member-5")).toEqual({
        read: true,
        upload: false,
        removeAny: false,
        removeOwn: false,
      });
      expect(trackingFilesFinal(decided)).toBe(status);
    }
    expect(trackingFilesFinal(inspection)).toBeNull();
    expect(trackingFilesFinal(issue)).toBeNull();
  });

  it("removes any file with Update, otherwise only the member's own", () => {
    const rights = trackingDocumentRights(
      member({ "tracking.issues": ["create", "read", "view_all"] }),
      issue,
      null,
    );
    expect(
      mayRemoveTrackingFile(rights, { createdBy: "user-2" }, "user-2"),
    ).toBe(true);
    expect(
      mayRemoveTrackingFile(rights, { createdBy: "user-3" }, "user-2"),
    ).toBe(false);
  });
});
