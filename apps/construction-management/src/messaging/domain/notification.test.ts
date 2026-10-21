import { describe, expect, it } from "vitest";

import {
  DOWNLOADS_GROUP,
  NOTIFICATION_GROUPS,
  isNotificationGroup,
  normalizeDraft,
  notificationGroup,
  pushPayload,
  retentionCutoffs,
} from "./notification";
import {
  APPROVAL_DOCUMENTS,
  approvalDocument,
  dateLabel,
  documentName,
  monthLabel,
  NOTIFICATION_KINDS,
  taskName,
} from "./notification-kinds";
import { MENUS } from "@/src/shared-kernel/access";

describe("notification rules (CM-904)", () => {
  it("keeps notifications 90 days and deliveries a year", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    expect(retentionCutoffs(now)).toEqual({
      notificationsBefore: new Date("2026-07-18T00:00:00.000Z"),
      deliveriesBefore: new Date("2025-10-16T00:00:00.000Z"),
    });
  });

  it("groups push by the menu's category, and ready notifications apart", () => {
    expect(notificationGroup("procurement.purchase_requests")).toBe(
      "materials",
    );
    expect(notificationGroup("hrms.leaves")).toBe("hrms");
    expect(notificationGroup(null)).toBe(DOWNLOADS_GROUP);
    expect(NOTIFICATION_GROUPS.map((group) => group.key)).toContain(
      "project_management",
    );
    expect(isNotificationGroup("downloads")).toBe(true);
    expect(isNotificationGroup("chat")).toBe(false);
  });

  it("trims and clips titles and bodies", () => {
    const draft = normalizeDraft({
      type: "task.assigned",
      menu: "tracking.tasks",
      projectId: null,
      title: `  ${"Shuttering ".repeat(30)}`,
      body: "   ",
      href: null,
      sourceKey: "k",
    });
    expect(draft.title.length).toBe(140);
    expect(draft.title.endsWith("…")).toBe(true);
    expect(draft.body).toBeNull();
  });

  it("sends the title, body and link to the service worker", () => {
    expect(
      pushPayload({ id: "n-1", title: "T", body: null, href: null }),
    ).toEqual({
      title: "T",
      body: null,
      href: "/app/notifications",
      tag: "n-1",
    });
  });

  it("gates every kind and approval document on a menu with a Notification flag", () => {
    const withN = new Set(
      MENUS.filter((menu) => menu.letters.includes("N")).map((m) => m.key),
    );
    for (const kind of Object.values(NOTIFICATION_KINDS))
      if (kind.menu != null) expect(withN.has(kind.menu)).toBe(true);
    // Other Expenses and the BOQ (CM-0023 §4: CRUDAJPOFEI) have no N in
    // the matrix: only the Owner hears of them.
    const withoutN = Object.entries(APPROVAL_DOCUMENTS)
      .filter(([, document]) => !withN.has(document.menu))
      .map(([type]) => type);
    expect(withoutN).toEqual(["other_expense", "variation"]);
  });

  it("names and links documents in plain words", () => {
    expect(documentName("Purchase Order", "PO-0007")).toBe(
      "Purchase Order PO-0007",
    );
    expect(documentName("Leave request", null)).toBe("A Leave request");
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(dateLabel("2026-10-05")).toBe("5 Oct 2026");
    expect(taskName(4, null)).toBe("Task #4");
    expect(
      approvalDocument("petty_cash_voucher")?.approverHref({
        id: "v-1",
        projectId: "p-1",
      }),
    ).toBe("/app/projects/p-1/payments/petty-cash/v-1");
    expect(
      approvalDocument("transaction")?.creatorHref({
        id: "t-1",
        projectId: null,
      }),
    ).toBeNull();
    expect(approvalDocument("material_transfer")).toBeNull();
  });
});
