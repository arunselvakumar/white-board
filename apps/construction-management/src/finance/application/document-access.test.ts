import { describe, expect, it } from "vitest";

import {
  PermissionSet,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

import {
  canOnFinanceDocument,
  financeDocumentRights,
  hiddenFinanceDocument,
  mayRemoveFinanceFile,
} from "./document-access";

function member(
  grants: PermissionGrants,
  projectIds: string[] = ["p1"],
): MemberAccess {
  return {
    workspaceId: "company-1",
    userId: "user-2",
    role: "member",
    permissions: PermissionSet.fromGrants(grants),
    projectIds: new Set(projectIds),
  };
}

const owner: MemberAccess = { ...member({}), role: "owner" };

describe("finance document access (CM-0017 §9, §14)", () => {
  it("checks the document's menu, on its Project when it names one", () => {
    const reader = member({ "finance.transactions": ["read"] });
    const onP1 = {
      type: "transaction" as const,
      projectId: "p1",
      storeId: null,
    };
    expect(canOnFinanceDocument(reader, onP1, "read")).toBe(true);
    expect(
      canOnFinanceDocument(reader, { ...onP1, projectId: "p2" }, "read"),
    ).toBe(false);
    // No Project: the menu alone.
    expect(
      canOnFinanceDocument(reader, { ...onP1, projectId: null }, "read"),
    ).toBe(true);
    // A transfer is on Transactions too; an invoice is on Parties.
    expect(
      canOnFinanceDocument(
        reader,
        { type: "account_transfer", projectId: null, storeId: null },
        "read",
      ),
    ).toBe(true);
    expect(
      canOnFinanceDocument(
        reader,
        { type: "invoice", projectId: "p1", storeId: null },
        "read",
      ),
    ).toBe(false);
  });

  it("keeps a Store-located invoice or payment to the Owner", () => {
    const parties = member({ "finance.parties": ["read", "create", "update"] });
    const atStore = {
      type: "party_payment" as const,
      projectId: null,
      storeId: "s1",
    };
    expect(canOnFinanceDocument(parties, atStore, "read")).toBe(false);
    expect(canOnFinanceDocument(owner, atStore, "read")).toBe(true);
  });

  it("hides another holder's petty-cash voucher without View all", () => {
    const voucher = {
      type: "petty_cash_voucher" as const,
      holderUserId: "user-9",
    };
    const own = member({ "finance.petty_cash": ["read"] });
    expect(hiddenFinanceDocument(own, voucher)).toBe(true);
    expect(
      hiddenFinanceDocument(own, { ...voucher, holderUserId: "user-2" }),
    ).toBe(false);
    const all = member({ "finance.petty_cash": ["read", "view_all"] });
    expect(hiddenFinanceDocument(all, voucher)).toBe(false);
    expect(hiddenFinanceDocument(owner, voucher)).toBe(false);
    expect(
      hiddenFinanceDocument(own, { type: "transaction", holderUserId: null }),
    ).toBe(false);
  });

  it("comments with Read, uploads with Create or Update, removes any with Update", () => {
    const doc = {
      type: "other_expense" as const,
      projectId: "p1",
      storeId: null,
    };
    expect(
      financeDocumentRights(
        member({ "finance.other_expenses": ["read"] }),
        doc,
      ),
    ).toEqual({
      read: true,
      comment: true,
      upload: false,
      removeAny: false,
      removeOwn: false,
    });
    const creator = financeDocumentRights(
      member({ "finance.other_expenses": ["read", "create"] }),
      doc,
    );
    expect(creator).toMatchObject({ upload: true, removeAny: false });
    expect(
      mayRemoveFinanceFile(creator, { createdBy: "user-2" }, "user-2"),
    ).toBe(true);
    expect(
      mayRemoveFinanceFile(creator, { createdBy: "user-3" }, "user-2"),
    ).toBe(false);
    const editor = financeDocumentRights(
      member({ "finance.other_expenses": ["read", "update"] }),
      doc,
    );
    expect(
      mayRemoveFinanceFile(editor, { createdBy: "user-3" }, "user-2"),
    ).toBe(true);
  });
});
