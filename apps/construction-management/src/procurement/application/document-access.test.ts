import { describe, expect, it } from "vitest";

import {
  PermissionSet,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

import { documentFileIdOfKey } from "../domain/document-thread";
import { canOnDocument, documentRights, mayRemove } from "./document-access";

function member(grants: PermissionGrants, projectIds: string[]): MemberAccess {
  return {
    workspaceId: "company-1",
    userId: "user-2",
    role: "member",
    permissions: PermissionSet.fromGrants(grants),
    projectIds: new Set(projectIds),
  };
}

const transfer = (scopes: (string | null)[]) => ({
  type: "material_transfer" as const,
  scopes,
});

describe("document access (M5)", () => {
  it("checks a project-scoped menu on the document's Project", () => {
    const reader = member({ "procurement.purchase_requests": ["read"] }, [
      "p1",
    ]);
    expect(
      canOnDocument(
        reader,
        { type: "purchase_request", scopes: ["p1"] },
        "read",
      ),
    ).toBe(true);
    expect(
      canOnDocument(
        reader,
        { type: "purchase_request", scopes: ["p2"] },
        "read",
      ),
    ).toBe(false);
    expect(
      canOnDocument(reader, { type: "purchase_order", scopes: ["p1"] }, "read"),
    ).toBe(false);
  });

  it("opens a transfer from either side, a Store side on the Company menu", () => {
    const onB = member({ "procurement.material_transfers": ["read"] }, ["b"]);
    expect(canOnDocument(onB, transfer(["a", "b"]), "read")).toBe(true);
    expect(canOnDocument(onB, transfer(["a", "c"]), "read")).toBe(false);
    expect(canOnDocument(onB, transfer([null, "a"]), "read")).toBe(true);
  });

  it("comments with Read, uploads with Create or Update, removes any with Update", () => {
    const doc = { type: "purchase_order" as const, scopes: ["p1"] };
    const reader = documentRights(
      member({ "procurement.purchase_orders": ["read"] }, ["p1"]),
      doc,
    );
    expect(reader).toEqual({
      read: true,
      comment: true,
      upload: false,
      removeAny: false,
      removeOwn: false,
    });
    const creator = documentRights(
      member({ "procurement.purchase_orders": ["read", "create"] }, ["p1"]),
      doc,
    );
    expect(mayRemove(creator, { createdBy: "user-2" }, "user-2")).toBe(true);
    expect(mayRemove(creator, { createdBy: "user-9" }, "user-2")).toBe(false);
    const editor = documentRights(
      member({ "procurement.purchase_orders": ["read", "update"] }, ["p1"]),
      doc,
    );
    expect(mayRemove(editor, { createdBy: "user-9" }, "user-2")).toBe(true);
    // Without Read nothing else counts.
    expect(
      documentRights(
        member({ "procurement.purchase_orders": ["create", "update"] }, ["p1"]),
        doc,
      ).upload,
    ).toBe(false);
  });

  it("takes a file's id from its key", () => {
    expect(
      documentFileIdOfKey(
        "companies/w1/procurement-documents/0199c4a0-0000-7000-8000-000000000001/0199c4a0-0000-7000-8000-00000000f001.pdf",
      ),
    ).toBe("0199c4a0-0000-7000-8000-00000000f001");
    expect(documentFileIdOfKey("companies/w1/x/y/not-a-uuid.pdf")).toBeNull();
  });
});
