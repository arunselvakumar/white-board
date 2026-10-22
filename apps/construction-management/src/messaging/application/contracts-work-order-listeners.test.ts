import { describe, expect, it } from "vitest";

import type { NotificationRecipientsQuery } from "@/src/shared-kernel/access/notification-recipients";

import type { NotificationDraft } from "../domain/notification";
import { approvalDocument } from "../domain/notification-kinds";
import type { InboundWorkOrderIssued } from "./inbound-events";
import { NotificationListeners } from "./listeners";
import type { Notifier } from "./notifier";
import type { NotificationNames, RecipientDirectory } from "./ports";

const WS = "ws-1";
const AT = new Date("2026-10-22T05:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

function setup() {
  const sent: { recipients: string[]; draft: NotificationDraft }[] = [];
  const queries: NotificationRecipientsQuery[] = [];
  const recipients: RecipientDirectory = {
    holders(query) {
      queries.push(query);
      return Promise.resolve(
        ["engineer", "approver"].filter((id) => id !== query.exceptUserId),
      );
    },
    usersOfMembers: () => Promise.resolve([]),
  };
  const names = {
    project: () => Promise.resolve("Metro Depot"),
  } as Partial<NotificationNames> as NotificationNames;
  const notifier = {
    notify(_workspaceId: string, to: readonly string[], draft) {
      sent.push({ recipients: [...to], draft });
      return Promise.resolve([]);
    },
  } as Pick<Notifier, "notify"> as Notifier;
  return {
    listeners: new NotificationListeners({ notifier, recipients, names }),
    sent,
    queries,
  };
}

describe("Work Order notifications (CM-1104, CM-0023 §5)", () => {
  it("tells Work Order Read + Notification holders on the Project it is issued, never the approver", async () => {
    const { listeners, sent, queries } = setup();
    const event: InboundWorkOrderIssued = {
      type: "WorkOrderIssued",
      workspaceId: WS,
      occurredAt: AT,
      workOrderId: "wo-1",
      projectId: PROJECT,
      number: "WO/26-27/00001",
      contractorName: "Velan Constructions",
      by: "approver",
    };
    await listeners.handle(event);
    expect(queries[0]).toMatchObject({
      menu: "contracts.work_orders",
      flag: "read",
      projectId: PROJECT,
      exceptUserId: "approver",
    });
    expect(sent).toEqual([
      {
        recipients: ["engineer"],
        draft: {
          type: "work_order.issued",
          title: "Work Order WO/26-27/00001 is issued",
          body: "To Velan Constructions in Metro Depot.",
          menu: "contracts.work_orders",
          projectId: PROJECT,
          href: `/app/projects/${PROJECT}/work-orders/wo-1`,
          sourceKey: `work_order.issued:wo-1:${AT.toISOString()}`,
        },
      },
    ]);
  });

  it("asks Work Order approvers through the approval document `work_order`", () => {
    const document = approvalDocument("work_order");
    expect(document?.menu).toBe("contracts.work_orders");
    expect(document?.approverHref({ id: "wo-1", projectId: PROJECT })).toBe(
      `/app/projects/${PROJECT}/work-orders/wo-1`,
    );
  });
});
